package auth_test

import (
	"testing"

	"github.com/imkln/portfolio/src/backend/tests/utils"
)

func TestOwnerSessionAndPrivateRoutes(t *testing.T) {
	owner, visitor := utils.StartBackend(t)
	visitor.RejectMismatchedState(t)
	var session struct {
		Owner bool `json:"owner"`
	}
	utils.Decode(t, owner.Request(t, "GET", "/api/session", "", 200), &session)
	if !session.Owner {
		t.Fatal("owner session did not report owner access")
	}
	visitor.Request(t, "GET", "/api/session", "", 401)

	for _, route := range []struct{ method, path string }{
		{"PUT", "/api/collections"},
		{"PATCH", "/api/collections/lake"},
		{"GET", "/api/photos"},
		{"POST", "/api/photos"},
		{"PATCH", "/api/photos"},
		{"GET", "/api/photos/lake"},
		{"GET", "/api/photos/lake/thumbnail"},
		{"DELETE", "/api/photos/lake"},
		{"GET", "/api/tags"},
		{"POST", "/api/tags"},
		{"DELETE", "/api/tags/lake"},
	} {
		visitor.Request(t, route.method, route.path, "", 401)
	}

	owner.SignOut(t)
	owner.Request(t, "GET", "/api/session", "", 401)
}
