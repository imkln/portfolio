package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
	"net/url"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"

	"github.com/imkln/portfolio/src/backend/internal/api/utils"
)

type loginState struct {
	State    string
	Nonce    string
	Verifier string
}

func (app *Sessions) Login(w http.ResponseWriter, r *http.Request) {
	flow := loginState{
		State:    randomValue(),
		Nonce:    randomValue(),
		Verifier: oauth2.GenerateVerifier(),
	}

	session, _ := app.loginCookies.New(r, flowCookie)
	session.Values = map[any]any{
		"state":    flow.State,
		"nonce":    flow.Nonce,
		"verifier": flow.Verifier,
	}

	if err := session.Save(r, w); err != nil {
		http.Error(w, "Unable to start sign-in", http.StatusInternalServerError)
		return
	}

	location := app.oauth.AuthCodeURL(flow.State,
		oauth2.S256ChallengeOption(flow.Verifier),
		oidc.Nonce(flow.Nonce),
		oauth2.SetAuthURLParam("identity_provider", "Google"),
		oauth2.SetAuthURLParam("prompt", "select_account"),
	)
	http.Redirect(w, r, location, http.StatusSeeOther)
}

func (app *Sessions) Callback(w http.ResponseWriter, r *http.Request) {
	session, err := app.loginCookies.Get(r, flowCookie)
	app.clearCookie(w, flowCookie)

	var flow loginState
	flow.State, _ = session.Values["state"].(string)
	flow.Nonce, _ = session.Values["nonce"].(string)
	flow.Verifier, _ = session.Values["verifier"].(string)
	if err != nil || flow.State == "" || subtle.ConstantTimeCompare([]byte(flow.State), []byte(r.URL.Query().Get("state"))) != 1 {
		http.Error(w, "Sign-in expired or was invalid. Please try again.", http.StatusBadRequest)
		return
	}

	if r.URL.Query().Get("error") != "" || r.URL.Query().Get("code") == "" {
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	tokens, err := app.oauth.Exchange(ctx, r.URL.Query().Get("code"), oauth2.VerifierOption(flow.Verifier))
	if err != nil {
		http.Error(w, "Unable to complete sign-in. Please try again.", http.StatusBadGateway)
		return
	}

	rawToken, ok := tokens.Extra("id_token").(string)
	if !ok {
		http.Error(w, "Sign-in did not return an identity", http.StatusBadGateway)
		return
	}

	token, err := app.verifyIdentity(ctx, rawToken)
	if err != nil || flow.Nonce == "" || subtle.ConstantTimeCompare([]byte(token.Nonce), []byte(flow.Nonce)) != 1 {
		app.clearCookie(w, sessionCookie)
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}

	userSession, _ := app.sessionCookies.New(r, sessionCookie)
	userSession.Values = map[any]any{"token": rawToken}
	userSession.Options.MaxAge = max(1, int(time.Until(token.Expiry).Seconds()))
	if err := userSession.Save(r, w); err != nil {
		http.Error(w, "Unable to save your session", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func (app *Sessions) Logout(w http.ResponseWriter, r *http.Request) {
	app.clearCookie(w, sessionCookie)
	app.clearCookie(w, flowCookie)
	query := url.Values{
		"client_id":  {app.config.ClientID},
		"logout_uri": {app.config.Origin + "/"},
	}

	http.Redirect(w, r, app.config.AuthDomain+"/logout?"+query.Encode(), http.StatusSeeOther)
}

func randomValue() string {
	value := make([]byte, 32)
	rand.Read(value)
	return base64.RawURLEncoding.EncodeToString(value)
}

func (app *Sessions) Session(w http.ResponseWriter, r *http.Request) {
	if !app.IsOwner(r) {
		utils.WriteJSONError(w, http.StatusUnauthorized)
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]bool{"owner": true})
}
