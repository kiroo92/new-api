package model

import (
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	TicketOpen         = "open"
	TicketResolved     = "resolved"
	TicketSubjectLimit = 120
	TicketContentLimit = 10000
)

var (
	ErrTicketInput    = errors.New("Invalid ticket input")
	ErrTicketResolved = errors.New("Reopen this ticket before replying")
)

type SupportTicket struct {
	Id        int    `json:"id"`
	UserId    int    `json:"user_id" gorm:"index:idx_ticket_owner_activity,priority:1"`
	Username  string `json:"username" gorm:"size:64"`
	Subject   string `json:"subject" gorm:"size:120"`
	Content   string `json:"content,omitempty" gorm:"type:text"`
	Status    string `json:"status" gorm:"size:16;index"`
	Category  string `json:"category" gorm:"size:16"`
	Priority  string `json:"priority" gorm:"size:16"`
	CreatedAt int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt int64  `json:"updated_at" gorm:"bigint;index:idx_ticket_owner_activity,priority:2"`
}

type SupportTicketMessage struct {
	Id        int    `json:"id"`
	TicketId  int    `json:"ticket_id" gorm:"index:idx_ticket_message,priority:1"`
	UserId    int    `json:"user_id"`
	Username  string `json:"username" gorm:"size:64"`
	IsStaff   bool   `json:"is_staff"`
	Content   string `json:"content" gorm:"type:text"`
	CreatedAt int64  `json:"created_at" gorm:"bigint;index:idx_ticket_message,priority:2"`
}

type TicketFilter struct {
	Keyword  string
	Status   string
	Category string
	Priority string
}

func (f TicketFilter) Validate() error {
	if utf8.RuneCountInString(f.Keyword) > TicketSubjectLimit {
		return ErrTicketInput
	}
	if f.Status != "" && f.Status != TicketOpen && f.Status != TicketResolved {
		return ErrTicketInput
	}
	switch f.Category {
	case "", "general", "billing", "technical", "account":
	default:
		return ErrTicketInput
	}
	switch f.Priority {
	case "", "low", "normal", "high", "urgent":
	default:
		return ErrTicketInput
	}
	return nil
}

func ticketScope(db *gorm.DB, userID int, management bool) *gorm.DB {
	query := db.Model(&SupportTicket{})
	if !management {
		query = query.Where("user_id = ?", userID)
	}
	return query
}

func ListSupportTickets(userID int, management bool, filter TicketFilter, offset, limit int) ([]SupportTicket, int64, error) {
	if userID <= 0 || offset < 0 || limit < 1 || limit > 100 {
		return nil, 0, ErrTicketInput
	}
	if err := filter.Validate(); err != nil {
		return nil, 0, err
	}
	query := ticketScope(DB, userID, management)
	if filter.Keyword != "" {
		// Escape SQL LIKE wildcards so the UI's subject search is literal.
		keyword := strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(strings.ToLower(filter.Keyword))
		query = query.Where("LOWER(subject) LIKE ? ESCAPE '!'", "%"+keyword+"%")
	}
	for field, value := range map[string]string{"status": filter.Status, "category": filter.Category, "priority": filter.Priority} {
		if value != "" {
			query = query.Where(map[string]any{field: value})
		}
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]SupportTicket, 0)
	err := query.Omit("content").Order("updated_at DESC, id DESC").Offset(offset).Limit(limit).Find(&items).Error
	return items, total, err
}

func CreateSupportTicket(ticket *SupportTicket) error {
	ticket.Subject = strings.TrimSpace(ticket.Subject)
	ticket.Content = strings.TrimSpace(ticket.Content)
	filter := TicketFilter{Category: ticket.Category, Priority: ticket.Priority}
	if ticket.UserId <= 0 || ticket.Category == "" || ticket.Priority == "" || filter.Validate() != nil ||
		!utf8.ValidString(ticket.Subject) || utf8.RuneCountInString(ticket.Subject) < 1 ||
		utf8.RuneCountInString(ticket.Subject) > TicketSubjectLimit ||
		!utf8.ValidString(ticket.Content) || utf8.RuneCountInString(ticket.Content) < 1 ||
		utf8.RuneCountInString(ticket.Content) > TicketContentLimit {
		return ErrTicketInput
	}
	ticket.Id = 0
	ticket.Status = TicketOpen
	ticket.CreatedAt = common.GetTimestamp()
	ticket.UpdatedAt = ticket.CreatedAt
	return DB.Create(ticket).Error
}

func GetSupportTicket(id, userID int, management bool) (*SupportTicket, error) {
	if id <= 0 || userID <= 0 {
		return nil, ErrTicketInput
	}
	var ticket SupportTicket
	err := ticketScope(DB, userID, management).Where("id = ?", id).First(&ticket).Error
	return &ticket, err
}

func GetSupportTicketMessages(id, userID int, management bool, offset, limit int) ([]SupportTicketMessage, int64, error) {
	if offset < 0 || limit < 1 || limit > 100 {
		return nil, 0, ErrTicketInput
	}
	if _, err := GetSupportTicket(id, userID, management); err != nil {
		return nil, 0, err
	}
	query := DB.Model(&SupportTicketMessage{}).Where("ticket_id = ?", id)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	messages := make([]SupportTicketMessage, 0)
	err := query.Order("id DESC").Offset(offset).Limit(limit).Find(&messages).Error
	return messages, total, err
}

func ReplySupportTicket(id, userID int, username string, management bool, content string) error {
	content = strings.TrimSpace(content)
	if id <= 0 || userID <= 0 || !utf8.ValidString(content) || utf8.RuneCountInString(content) < 1 || utf8.RuneCountInString(content) > TicketContentLimit {
		return ErrTicketInput
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var ticket SupportTicket
		if err := lockForUpdate(ticketScope(tx, userID, management)).Where("id = ?", id).First(&ticket).Error; err != nil {
			return err
		}
		if ticket.Status == TicketResolved {
			return ErrTicketResolved
		}
		now := common.GetTimestamp()
		if err := tx.Model(&ticket).Update("updated_at", now).Error; err != nil {
			return err
		}
		return tx.Create(&SupportTicketMessage{
			TicketId: id, UserId: userID, Username: username, IsStaff: management, Content: content, CreatedAt: now,
		}).Error
	})
}

func SetSupportTicketStatus(id, userID int, management bool, status string) error {
	if id <= 0 || userID <= 0 || (status != TicketOpen && status != TicketResolved) {
		return ErrTicketInput
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var ticket SupportTicket
		if err := lockForUpdate(ticketScope(tx, userID, management)).Where("id = ?", id).First(&ticket).Error; err != nil {
			return err
		}
		return tx.Model(&ticket).Updates(map[string]any{"status": status, "updated_at": common.GetTimestamp()}).Error
	})
}
