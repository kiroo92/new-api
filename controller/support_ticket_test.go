package controller

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Run with TICKET_TEST_DSN (MySQL/PostgreSQL) or TICKET_TEST_SQLITE to exercise
// a dedicated real database, including one initialized by a released binary.
func TestSupportTicketWorkflow(t *testing.T) {
	oldDB, oldLogDB := model.DB, model.LOG_DB
	oldPath, oldMaster := common.SQLitePath, common.IsMasterNode
	oldRedis := common.RedisEnabled
	common.RedisEnabled = false
	oldType, oldLogType := common.MainDatabaseType(), common.LogDatabaseType()
	t.Cleanup(func() {
		model.DB, model.LOG_DB = oldDB, oldLogDB
		common.SQLitePath, common.IsMasterNode = oldPath, oldMaster
		common.RedisEnabled = oldRedis
		common.SetMainDatabaseType(oldType)
		common.SetLogDatabaseType(oldLogType)
	})
	dsn := os.Getenv("TICKET_TEST_DSN")
	t.Setenv("SQL_DSN", dsn)
	t.Setenv("LOG_SQL_DSN", "")
	common.SQLitePath = os.Getenv("TICKET_TEST_SQLITE")
	if common.SQLitePath == "" {
		common.SQLitePath = filepath.Join(t.TempDir(), "tickets.db")
	}
	common.IsMasterNode = true
	var dialector gorm.Dialector = sqlite.Open(common.SQLitePath)
	if strings.HasPrefix(dsn, "postgres") {
		dialector = postgres.Open(dsn)
	} else if dsn != "" {
		dialector = mysql.Open(dsn)
	}
	before, err := gorm.Open(dialector, &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	type userSnapshot struct {
		Id       int
		Username string
		Quota    int
	}
	existing := make([]userSnapshot, 0)
	if before.Migrator().HasTable("users") {
		require.NoError(t, before.Table("users").Select("id, username, quota").Order("id").Find(&existing).Error)
	}
	if os.Getenv("TICKET_REQUIRE_UPGRADE") == "1" {
		require.NotEmpty(t, existing, "released database must contain a representative user")
	}
	sqlBefore, err := before.DB()
	require.NoError(t, err)
	require.NoError(t, sqlBefore.Close())
	var persisted model.SupportTicket
	for pass := range 2 {
		require.NoError(t, model.InitDB())
		db, err := model.DB.DB()
		require.NoError(t, err)
		t.Cleanup(func() { _ = db.Close() })
		if pass == 0 {
			persisted = model.SupportTicket{UserId: 909, Username: "migration", Subject: "Restart check", Content: "Preserve content", Category: "general", Priority: "normal"}
			require.NoError(t, model.CreateSupportTicket(&persisted))
			require.NoError(t, model.ReplySupportTicket(persisted.Id, 909, "migration", false, "Preserve reply"))
		}
	}
	db := model.DB
	saved, err := model.GetSupportTicket(persisted.Id, 909, false)
	require.NoError(t, err)
	assert.Equal(t, persisted.Content, saved.Content)
	messages, total, err := model.GetSupportTicketMessages(persisted.Id, 909, false, 0, 20)
	require.NoError(t, err)
	require.Len(t, messages, 1)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, "Preserve reply", messages[0].Content)
	require.NoError(t, db.Where("ticket_id = ?", persisted.Id).Delete(&model.SupportTicketMessage{}).Error)
	require.NoError(t, db.Delete(&persisted).Error)
	model.LOG_DB = db
	require.NoError(t, model.MigrateAuditLogs())
	var after []userSnapshot
	require.NoError(t, db.Table("users").Select("id, username, quota").Order("id").Find(&after).Error)
	assert.Equal(t, existing, after, "migration must preserve released users and quotas")
	require.True(t, db.Migrator().HasIndex(&model.SupportTicket{}, "idx_ticket_owner_activity"))
	require.True(t, db.Migrator().HasIndex(&model.SupportTicketMessage{}, "idx_ticket_message"))
	var version string
	if db.Dialector.Name() == "sqlite" {
		require.NoError(t, db.Raw("SELECT sqlite_version()").Scan(&version).Error)
	} else {
		require.NoError(t, db.Raw("SELECT version()").Scan(&version).Error)
	}
	t.Logf("database=%s version=%s preserved_users=%d", db.Dialector.Name(), version, len(existing))

	tx := db.Begin()
	require.NoError(t, tx.Error)
	model.DB = tx
	model.LOG_DB = tx
	t.Cleanup(func() { _ = tx.Rollback().Error })
	ticket := &model.SupportTicket{UserId: 101, Username: "customer", Subject: "API 100%_中文", Content: "请求失败，需要帮助", Category: "technical", Priority: "high"}
	require.NoError(t, model.CreateSupportTicket(ticket))
	other := &model.SupportTicket{UserId: 202, Username: "other", Subject: "Billing question", Content: "Invoice", Category: "billing", Priority: "normal"}
	require.NoError(t, model.CreateSupportTicket(other))

	t.Run("scoped search and pagination", func(t *testing.T) {
		items, total, err := model.ListSupportTickets(101, false, model.TicketFilter{Keyword: "%_", Category: "technical", Priority: "high", Status: "open"}, 0, 20)
		require.NoError(t, err)
		require.Len(t, items, 1)
		assert.Equal(t, int64(1), total)
		assert.Equal(t, ticket.Id, items[0].Id)
		assert.Empty(t, items[0].Content)
		items, total, err = model.ListSupportTickets(303, true, model.TicketFilter{}, 0, 1)
		require.NoError(t, err)
		assert.Len(t, items, 1)
		assert.Equal(t, int64(2), total)
		_, err = model.GetSupportTicket(other.Id, 101, false)
		assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
		_, _, err = model.GetSupportTicketMessages(other.Id, 101, false, 0, 50)
		assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
		assert.ErrorIs(t, model.ReplySupportTicket(other.Id, 101, "customer", false, "attack"), gorm.ErrRecordNotFound)
		assert.ErrorIs(t, model.SetSupportTicketStatus(other.Id, 101, false, "resolved"), gorm.ErrRecordNotFound)
	})
	t.Run("staff replies and resolve reopen workflow", func(t *testing.T) {
		require.NoError(t, model.ReplySupportTicket(ticket.Id, 303, "staff", true, "已检查"))
		require.NoError(t, model.SetSupportTicketStatus(ticket.Id, 101, false, "resolved"))
		assert.ErrorIs(t, model.ReplySupportTicket(ticket.Id, 303, "staff", true, "blocked"), model.ErrTicketResolved)
		require.NoError(t, model.SetSupportTicketStatus(ticket.Id, 303, true, "open"))
		require.NoError(t, model.ReplySupportTicket(ticket.Id, 101, "customer", false, "谢谢"))
		messages, total, err := model.GetSupportTicketMessages(ticket.Id, 101, false, 0, 1)
		require.NoError(t, err)
		require.Len(t, messages, 1)
		assert.Equal(t, int64(2), total)
		assert.Equal(t, "谢谢", messages[0].Content)
		assert.False(t, messages[0].IsStaff)
		messages, _, err = model.GetSupportTicketMessages(ticket.Id, 101, false, 1, 1)
		require.NoError(t, err)
		require.Len(t, messages, 1)
		assert.True(t, messages[0].IsStaff)
		assert.Equal(t, "已检查", messages[0].Content)
	})
	t.Run("input boundaries", func(t *testing.T) {
		for _, content := range []string{" ", strings.Repeat("界", 10001)} {
			assert.ErrorIs(t, model.ReplySupportTicket(ticket.Id, 101, "customer", false, content), model.ErrTicketInput)
		}
		assert.ErrorIs(t, model.SetSupportTicketStatus(ticket.Id, 101, false, "deleted"), model.ErrTicketInput)
		bad := *ticket
		bad.Subject = strings.Repeat("x", 121)
		assert.ErrorIs(t, model.CreateSupportTicket(&bad), model.ErrTicketInput)
		_, _, err := model.ListSupportTickets(101, false, model.TicketFilter{Category: "bad"}, 0, 20)
		assert.ErrorIs(t, err, model.ErrTicketInput)
	})
	t.Run("API ignores client ownership and staff fields", func(t *testing.T) {
		gin.SetMode(gin.TestMode)
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Set("id", 101)
		ctx.Set("username", "customer")
		ctx.Set("role", common.RoleCommonUser)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/api/tickets", strings.NewReader(`{"user_id":202,"status":"resolved","subject":"API","content":"help","category":"general","priority":"normal"}`))
		CreateSupportTicket(ctx)
		require.Equal(t, http.StatusOK, recorder.Code)
		var result struct {
			Success bool
			Data    model.SupportTicket
		}
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &result))
		require.True(t, result.Success)
		assert.Equal(t, 101, result.Data.UserId)
		assert.Equal(t, model.TicketOpen, result.Data.Status)

		recorder = httptest.NewRecorder()
		ctx, _ = gin.CreateTestContext(recorder)
		ctx.Set("id", 101)
		ctx.Set("role", common.RoleCommonUser)
		ctx.Set("support_ticket_management", true)
		ctx.Params = gin.Params{{Key: "id", Value: strconv.Itoa(other.Id)}}
		ctx.Request = httptest.NewRequest(http.MethodGet, "/api/tickets/"+strconv.Itoa(other.Id), nil)
		GetSupportTicket(ctx)
		assert.Equal(t, http.StatusNotFound, recorder.Code)
	})
	t.Run("real authentication rejects anonymous and non-admin management access", func(t *testing.T) {
		userToken, adminToken := "ticket-test-user-pat", "ticket-test-admin-pat"
		require.NoError(t, tx.Create(&model.User{Id: 101, Username: "ticketuser", AffCode: "tktuser", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AccessToken: &userToken}).Error)
		require.NoError(t, tx.Create(&model.User{Id: 303, Username: "ticketadmin", AffCode: "tktadmin", Role: common.RoleAdminUser, Status: common.UserStatusEnabled, AccessToken: &adminToken}).Error)
		engine := gin.New()
		engine.GET("/tickets", middleware.UserAuth(), ListSupportTickets)
		engine.GET("/management", middleware.AdminAuth(), func(c *gin.Context) { c.Set("support_ticket_management", true) }, ListSupportTickets)
		for _, tc := range []struct {
			path, token string
			status      int
		}{
			{"/tickets", "", http.StatusUnauthorized},
			{"/management", userToken, http.StatusForbidden},
			{"/tickets", userToken, http.StatusOK},
			{"/management", adminToken, http.StatusOK},
		} {
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			if tc.token != "" {
				req.Header.Set("Authorization", "Bearer "+tc.token)
			}
			res := httptest.NewRecorder()
			engine.ServeHTTP(res, req)
			assert.Equal(t, tc.status, res.Code, tc.path)
		}
		require.Error(t, tx.Transaction(func(inner *gorm.DB) error {
			return inner.Create(&model.User{Username: "ticketuser", AffCode: "tktdup"}).Error
		}), "existing username uniqueness must survive migration")
	})
	require.NoError(t, tx.Rollback().Error)
	model.DB = db
}
