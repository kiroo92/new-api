package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Management scope is set only by the AdminAuth-protected router group.
func supportTicketAccess(c *gin.Context) (int, bool) {
	return c.GetInt("id"), c.GetBool("support_ticket_management") && c.GetInt("role") >= common.RoleAdminUser
}

func supportTicketError(c *gin.Context, err error) {
	status, message := http.StatusInternalServerError, "Unable to process ticket"
	code := "SUPPORT_TICKET_FAILED"
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		status, message = http.StatusNotFound, "Ticket not found"
		code = "SUPPORT_TICKET_NOT_FOUND"
	case errors.Is(err, model.ErrTicketInput):
		status, message = http.StatusBadRequest, "Invalid ticket input"
		code = "SUPPORT_TICKET_INVALID"
	case errors.Is(err, model.ErrTicketResolved):
		status, message = http.StatusConflict, "Reopen this ticket before replying"
		code = "SUPPORT_TICKET_RESOLVED"
	default:
		common.SysError("support ticket: " + err.Error())
	}
	c.JSON(status, gin.H{"success": false, "code": code, "message": message})
}

func ListSupportTickets(c *gin.Context) {
	userID, management := supportTicketAccess(c)
	page := common.GetPageQuery(c)
	if page.Page < 1 || page.Page > 10000000 || page.PageSize < 1 {
		supportTicketError(c, model.ErrTicketInput)
		return
	}
	limit := min(page.GetPageSize(), 100)
	filter := model.TicketFilter{Keyword: c.Query("keyword"), Status: c.Query("status"), Category: c.Query("category"), Priority: c.Query("priority")}
	items, total, err := model.ListSupportTickets(userID, management, filter, page.GetStartIdx(), limit)
	if err != nil {
		supportTicketError(c, err)
		return
	}
	page.SetTotal(int(total))
	page.SetItems(items)
	common.ApiSuccess(c, page)
}

func CreateSupportTicket(c *gin.Context) {
	var input struct {
		Subject  string `json:"subject"`
		Content  string `json:"content"`
		Category string `json:"category"`
		Priority string `json:"priority"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 128*1024)
	if err := c.ShouldBindJSON(&input); err != nil {
		supportTicketError(c, model.ErrTicketInput)
		return
	}
	ticket := &model.SupportTicket{UserId: c.GetInt("id"), Username: c.GetString("username"), Subject: input.Subject, Content: input.Content, Category: input.Category, Priority: input.Priority}
	if err := model.CreateSupportTicket(ticket); err != nil {
		supportTicketError(c, err)
		return
	}
	common.ApiSuccess(c, ticket)
}

func GetSupportTicket(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		supportTicketError(c, model.ErrTicketInput)
		return
	}
	userID, management := supportTicketAccess(c)
	ticket, err := model.GetSupportTicket(id, userID, management)
	if err != nil {
		supportTicketError(c, err)
		return
	}
	page := common.GetPageQuery(c)
	if page.Page < 1 || page.Page > 10000000 || page.PageSize < 1 {
		supportTicketError(c, model.ErrTicketInput)
		return
	}
	messages, total, err := model.GetSupportTicketMessages(id, userID, management, page.GetStartIdx(), min(page.GetPageSize(), 100))
	if err != nil {
		supportTicketError(c, err)
		return
	}
	page.SetItems(messages)
	page.SetTotal(int(total))
	common.ApiSuccess(c, gin.H{"ticket": ticket, "messages": page})
}

func ReplySupportTicket(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		supportTicketError(c, model.ErrTicketInput)
		return
	}
	var input struct {
		Content string `json:"content"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 128*1024)
	if c.ShouldBindJSON(&input) != nil {
		supportTicketError(c, model.ErrTicketInput)
		return
	}
	userID, management := supportTicketAccess(c)
	if err := model.ReplySupportTicket(id, userID, c.GetString("username"), management, input.Content); err != nil {
		supportTicketError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func SetSupportTicketStatus(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		supportTicketError(c, model.ErrTicketInput)
		return
	}
	var input struct {
		Status string `json:"status"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
	if c.ShouldBindJSON(&input) != nil {
		supportTicketError(c, model.ErrTicketInput)
		return
	}
	userID, management := supportTicketAccess(c)
	if err := model.SetSupportTicketStatus(id, userID, management, input.Status); err != nil {
		supportTicketError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
