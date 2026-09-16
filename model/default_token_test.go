package model

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// External databases must be dedicated fixtures. Use DEFAULT_TOKEN_TEST_DSN or
// DEFAULT_TOKEN_TEST_SQLITE (a copy of a released database) for migration checks.
func TestUserDefaultAPIKeyLifecycle(t *testing.T) {
	oldDB, oldLogDB, oldRDB := DB, LOG_DB, common.RDB
	oldRedis, oldMaster := common.RedisEnabled, common.IsMasterNode
	oldPath, oldMain, oldLog := common.SQLitePath, common.MainDatabaseType(), common.LogDatabaseType()
	oldNewQuota, oldDefault := common.QuotaForNewUser, constant.GenerateDefaultToken
	t.Cleanup(func() {
		DB, LOG_DB, common.RDB = oldDB, oldLogDB, oldRDB
		common.RedisEnabled, common.IsMasterNode = oldRedis, oldMaster
		common.SQLitePath = oldPath
		common.SetDatabaseTypes(oldMain, oldLog)
		common.QuotaForNewUser, constant.GenerateDefaultToken = oldNewQuota, oldDefault
		initCol()
	})
	t.Setenv("SQL_DSN", os.Getenv("DEFAULT_TOKEN_TEST_DSN"))
	t.Setenv("LOG_SQL_DSN", "")
	common.RedisEnabled, common.IsMasterNode = false, true
	common.QuotaForNewUser, constant.GenerateDefaultToken = 0, false
	common.SQLitePath = os.Getenv("DEFAULT_TOKEN_TEST_SQLITE")
	if common.SQLitePath == "" {
		common.SQLitePath = filepath.Join(t.TempDir(), "keys.db")
	}
	db, _, err := chooseDB("SQL_DSN", false)
	require.NoError(t, err)
	type userSnapshot struct {
		Id       int
		Username string
		Quota    int
	}
	before := make([]userSnapshot, 0)
	if db.Migrator().HasTable(&User{}) {
		require.NoError(t, db.Model(&User{}).Select("id", "username", "quota").Order("id").Scan(&before).Error)
	}
	if os.Getenv("DEFAULT_TOKEN_REQUIRE_UPGRADE") == "1" {
		require.NotEmpty(t, before)
		if !db.Migrator().HasColumn(&Token{}, "is_default") {
			for _, key := range []string{"released-fixture-key-one", "released-fixture-key-two"} {
				legacy := &Token{UserId: before[0].Id, Key: key, Name: "released", Status: common.TokenStatusEnabled, UsedQuota: 42, ExpiredTime: -1}
				require.NoError(t, db.Omit("IsDefault").Create(legacy).Error)
			}
		}
	}
	conn, err := db.DB()
	require.NoError(t, err)
	require.NoError(t, conn.Close())
	common.RedisEnabled, common.RDB = true, nil
	for range 2 {
		require.NoError(t, InitDB())
		sqlDB, err := DB.DB()
		require.NoError(t, err)
		t.Cleanup(func() { _ = sqlDB.Close() })
	}
	common.RedisEnabled = false
	DB.Logger = logger.Default.LogMode(logger.Silent)
	after := make([]userSnapshot, 0)
	require.NoError(t, DB.Model(&User{}).Select("id", "username", "quota").Order("id").Scan(&after).Error)
	assert.Equal(t, before, after)
	if os.Getenv("DEFAULT_TOKEN_REQUIRE_UPGRADE") == "1" {
		var migrated []Token
		require.NoError(t, DB.Where("user_id = ?", before[0].Id).Find(&migrated).Error)
		require.Len(t, migrated, 1)
		assert.Equal(t, "released-fixture-key-one", migrated[0].Key)
		assert.Equal(t, 42, migrated[0].UsedQuota)
		assert.True(t, migrated[0].IsDefault)
	}
	var version string
	sqlVersion := "SELECT version()"
	if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
		sqlVersion = "SELECT sqlite_version()"
	}
	require.NoError(t, DB.Raw(sqlVersion).Scan(&version).Error)
	t.Logf("database=%s version=%s preserved_users=%d", DB.Dialector.Name(), version, len(before))
	database := DB
	tx := DB.Begin()
	require.NoError(t, tx.Error)
	t.Cleanup(func() { _ = tx.Rollback().Error })
	DB, LOG_DB = tx, tx

	owner := &User{Username: "singleton-owner", AffCode: "singleton-owner", Status: common.UserStatusEnabled, Role: common.RoleCommonUser}
	require.NoError(t, tx.Create(owner).Error)
	first := &Token{UserId: owner.Id, Name: "retain-name", Key: "legacy-singleton-first", Status: common.TokenStatusDisabled, ModelLimitsEnabled: true, ModelLimits: "one-model", UsedQuota: 37, Group: "vip"}
	extra := &Token{UserId: owner.Id, Name: "retain-history", Key: "legacy-singleton-extra", Status: common.TokenStatusEnabled}
	require.NoError(t, tx.Create(first).Error)
	require.NoError(t, tx.Create(extra).Error)
	common.RedisEnabled, common.RDB = true, nil
	require.NoError(t, MigrateUserAPIKeys())
	require.NoError(t, MigrateUserAPIKeys())
	common.RedisEnabled = false
	var keys []Token
	require.NoError(t, tx.Where("user_id = ?", owner.Id).Find(&keys).Error)
	require.Len(t, keys, 1)
	adopted := keys[0]
	assert.Equal(t, first.Id, adopted.Id)
	assert.Equal(t, first.Key, adopted.Key)
	assert.Equal(t, 37, adopted.UsedQuota)
	assert.Equal(t, common.TokenStatusDisabled, adopted.Status)
	assert.True(t, adopted.IsDefault)
	assert.True(t, adopted.UnlimitedQuota)
	assert.False(t, adopted.ModelLimitsEnabled)
	assert.Empty(t, adopted.ModelLimits)
	assert.Empty(t, adopted.Group)
	assert.Equal(t, int64(-1), adopted.ExpiredTime)
	var history Token
	require.NoError(t, tx.Unscoped().First(&history, extra.Id).Error)
	assert.True(t, history.DeletedAt.Valid)
	var redisClient *redis.Client
	if addr := os.Getenv("DEFAULT_TOKEN_TEST_REDIS"); addr != "" {
		redisClient = redis.NewClient(&redis.Options{Addr: addr})
		t.Cleanup(func() { _ = redisClient.Close() })
		common.RDB, common.RedisEnabled = redisClient, true
		_, err = cacheInitToken(adopted)
		require.NoError(t, err)
	}
	rotated, err := RegenerateUserDefaultToken(owner.Id, owner.Username)
	require.NoError(t, err)
	assert.NotEqual(t, adopted.Key, rotated.Key)
	assert.Equal(t, adopted.Id, rotated.Id)
	assert.Equal(t, 37, rotated.UsedQuota)
	assert.Equal(t, common.TokenStatusEnabled, rotated.Status)
	if redisClient != nil {
		// Simulate a reader republishing an old credential despite the cache fence.
		require.NoError(t, common.RedisHSetObj(getTokenCacheKey(adopted.Key), &adopted, time.Minute))
	}
	_, err = GetTokenByKey(adopted.Key, false)
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
	_, err = GetTokenByKey(extra.Key, false)
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
	valid, err := ValidateUserToken(rotated.Key)
	require.NoError(t, err)
	assert.Equal(t, rotated.Id, valid.Id)
	common.RedisEnabled = false

	t.Run("registration paths and rollback", func(t *testing.T) {
		for _, transactional := range []bool{false, true} {
			name := "registered-normal"
			if transactional {
				name = "registered-oauth"
			}
			user := &User{Username: name, Status: common.UserStatusEnabled, Role: common.RoleCommonUser}
			if transactional {
				err = tx.Transaction(func(nested *gorm.DB) error { return user.InsertWithTx(nested, 0) })
			} else {
				err = user.Insert(0)
			}
			require.NoError(t, err)
			var tokens []Token
			require.NoError(t, tx.Where("user_id = ?", user.Id).Find(&tokens).Error)
			require.Len(t, tokens, 1)
			assert.True(t, tokens[0].IsDefault)
			assert.True(t, tokens[0].UnlimitedQuota)
		}
		fail := func(db *gorm.DB) {
			if db.Statement.Table == "tokens" {
				_ = db.AddError(errors.New("test storage failure"))
			}
		}
		require.NoError(t, tx.Callback().Create().Before("gorm:create").Register("singleton:failure", fail))
		failed := &User{Username: "registered-failed"}
		createErr := failed.Insert(0)
		require.NoError(t, tx.Callback().Create().Remove("singleton:failure"))
		require.Error(t, createErr)
		var count int64
		require.NoError(t, tx.Model(&User{}).Where("username = ?", "registered-failed").Count(&count).Error)
		assert.Zero(t, count)
	})
	_, err = CreateUserDefaultToken(0, "")
	assert.Error(t, err)
	require.NoError(t, tx.Rollback().Error)
	DB, LOG_DB = database, database
	t.Run("concurrent provisioning keeps one credential", func(t *testing.T) {
		user := &User{Username: "singleton-concurrent", AffCode: "single-concurrent"}
		require.NoError(t, database.Create(user).Error)
		t.Cleanup(func() {
			require.NoError(t, database.Unscoped().Where("user_id = ?", user.Id).Delete(&Token{}).Error)
			require.NoError(t, database.Unscoped().Delete(user).Error)
		})
		start := make(chan struct{})
		results := make(chan error, 2)
		var workers sync.WaitGroup
		for range 2 {
			workers.Go(func() {
				<-start
				_, err := CreateUserDefaultToken(user.Id, user.Username)
				results <- err
			})
		}
		close(start)
		workers.Wait()
		close(results)
		successes := 0
		for err := range results {
			if err == nil {
				successes++
				continue
			}
			if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
				assert.Contains(t, strings.ToLower(err.Error()), "locked")
			} else {
				require.NoError(t, err)
			}
		}
		assert.Positive(t, successes)
		var keys []Token
		require.NoError(t, database.Where("user_id = ?", user.Id).Find(&keys).Error)
		require.Len(t, keys, 1)
		assert.True(t, keys[0].IsDefault)
	})
}
