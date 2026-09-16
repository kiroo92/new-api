package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

var ErrUserAPIKeyExists = errors.New("Use your existing API key or regenerate it")

// CreateUserDefaultTokenWithTx serializes provisioning and adoption on the user
// row, including the no-token case. Callers must supply a transaction.
func CreateUserDefaultTokenWithTx(tx *gorm.DB, userID int, username string) (*Token, error) {
	if userID <= 0 {
		return nil, errors.New("invalid user id")
	}
	var user User
	if err := lockForUpdate(tx).Select("id").First(&user, userID).Error; err != nil {
		return nil, err
	}
	var tokens []Token
	if err := tx.Where("user_id = ?", userID).Order("id ASC").Find(&tokens).Error; err != nil {
		return nil, err
	}
	if len(tokens) == 1 && tokens[0].IsDefault && tokens[0].UnlimitedQuota &&
		!tokens[0].ModelLimitsEnabled && tokens[0].ModelLimits == "" && tokens[0].ExpiredTime == -1 &&
		tokens[0].Group == "" && tokens[0].AutoGroups == "" && !tokens[0].CrossGroupRetry {
		return &tokens[0], nil
	}
	if len(tokens) == 0 {
		key, err := common.GenerateKey()
		if err != nil {
			return nil, err
		}
		token := &Token{UserId: userID, Name: "Default API Key", Key: key, Status: common.TokenStatusEnabled,
			CreatedTime: common.GetTimestamp(), ExpiredTime: -1, UnlimitedQuota: true, IsDefault: true}
		if err := tx.Create(token).Error; err != nil {
			return nil, sanitizeDBError(err)
		}
		return token, nil
	}
	primary := tokens[0]
	// Invalidate before changing metadata. Lookup also checks the database to
	// reject rotated keys even if a stale reader repopulates Redis.
	// Startup migration runs before the Redis client is initialized.
	if common.RDB != nil {
		if err := invalidateTokensCache(tokens); err != nil {
			return nil, err
		}
	}
	if err := tx.Model(&primary).Updates(map[string]any{
		"is_default": true, "expired_time": -1, "unlimited_quota": true,
		"model_limits_enabled": false, "model_limits": "", "group": "", "auto_groups": "", "cross_group_retry": false,
	}).Error; err != nil {
		return nil, err
	}
	if err := tx.Where("user_id = ? AND id <> ?", userID, primary.Id).Delete(&Token{}).Error; err != nil {
		return nil, err
	}
	if err := tx.First(&primary, primary.Id).Error; err != nil {
		return nil, err
	}
	return &primary, nil
}

func CreateUserDefaultToken(userID int, username string) (*Token, error) {
	var token *Token
	err := DB.Transaction(func(tx *gorm.DB) error {
		var err error
		token, err = CreateUserDefaultTokenWithTx(tx, userID, username)
		return err
	})
	return token, sanitizeDBError(err)
}

// MigrateUserAPIKeys retains a legacy key and its usage/history, soft-deletes
// extra credentials, and seeds accounts without a key. It is idempotent.
func MigrateUserAPIKeys() error {
	var lastID int
	for {
		var users []User
		if err := DB.Select("id", "username").Where("id > ?", lastID).Order("id").Limit(200).Find(&users).Error; err != nil {
			return err
		}
		if len(users) == 0 {
			return nil
		}
		for _, user := range users {
			if _, err := CreateUserDefaultToken(user.Id, user.Username); err != nil {
				return err
			}
			lastID = user.Id
		}
	}
}

func RegenerateUserDefaultToken(userID int, username string) (*Token, error) {
	var token *Token
	err := DB.Transaction(func(tx *gorm.DB) error {
		var err error
		token, err = CreateUserDefaultTokenWithTx(tx, userID, username)
		if err != nil {
			return err
		}
		key, err := common.GenerateKey()
		if err != nil {
			return err
		}
		if common.RDB != nil {
			if err := invalidateTokenCacheForMutation(token.Key); err != nil {
				return err
			}
		}
		if err := tx.Model(token).Updates(map[string]any{"key": key, "status": common.TokenStatusEnabled}).Error; err != nil {
			return err
		}
		token.Key = key
		token.Status = common.TokenStatusEnabled
		return nil
	})
	return token, sanitizeDBError(err)
}
