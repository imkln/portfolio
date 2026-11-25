package auth_test

import (
	"encoding/json"
	"net/http"
	"slices"
	"testing"

	"github.com/imkln/portfolio/src/backend/tests/utils"
)

func TestOwnerGetsSession(t *testing.T) {
	fixture := utils.NewAuth(t, utils.OwnerEmail)

	cookie := fixture.SignIn(t)
	response := utils.Request(fixture.Mux, http.MethodGet, "/api/session", "", cookie)

	utils.CheckStatus(t, response, http.StatusOK)
	var session struct {
		Owner bool `json:"owner"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &session); err != nil || !session.Owner {
		t.Fatalf("session response = %s, want owner: true", response.Body)
	}
}

func TestNonOwnerDoesNotGetSession(t *testing.T) {
	fixture := utils.NewAuth(t, utils.NonOwnerEmail)

	response := fixture.Callback(t)

	utils.CheckStatus(t, response, http.StatusSeeOther)
	if response.Header().Get("Location") != "/" {
		t.Fatalf("sign-in should return to Home, got %s", response.Header().Get("Location"))
	}
	for _, cookie := range response.Result().Cookies() {
		if cookie.MaxAge >= 0 {
			t.Fatalf("non-owner received a cookie: %s", cookie.Name)
		}
	}
}

func TestSignInRejectsMismatchedState(t *testing.T) {
	fixture := utils.NewAuth(t, utils.OwnerEmail)
	login := utils.Request(fixture.Mux, http.MethodGet, "/auth/login", "")
	utils.CheckStatus(t, login, http.StatusSeeOther)

	response := utils.Request(fixture.Mux, http.MethodGet,
		"/auth/callback?code=test-code&state=wrong", "", login.Result().Cookies()...)

	utils.CheckStatus(t, response, http.StatusBadRequest)
}

func TestSigningOutClearsSessionCookie(t *testing.T) {
	fixture := utils.NewAuth(t, utils.OwnerEmail)
	session := fixture.SignIn(t)

	response := utils.Request(fixture.Mux, http.MethodPost, "/auth/logout", "", session)

	utils.CheckStatus(t, response, http.StatusSeeOther)
	if !slices.ContainsFunc(response.Result().Cookies(), func(cookie *http.Cookie) bool {
		return cookie.Name == session.Name && cookie.MaxAge < 0
	}) {
		t.Fatal("sign-out did not clear the session cookie")
	}
}
