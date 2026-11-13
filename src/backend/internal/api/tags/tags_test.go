package tags_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/imkln/portfolio/src/backend/internal/api/tags"
	"github.com/imkln/portfolio/src/backend/internal/api/testutils"
)

func TestCanCreateTag(t *testing.T) {
	app := newApp(t, true)

	tag := createTag(t, app, "France", "")

	if tag.Name != "France" || tag.ParentID != "" {
		t.Fatalf("created tag = %+v", tag)
	}
}

func TestCanCreateNestedTag(t *testing.T) {
	app := newApp(t, true)
	parent := createTag(t, app, "France", "")

	tag := createTag(t, app, "Paris", parent.ID)

	if tag.ParentID != parent.ID {
		t.Fatalf("parent = %q, want %q", tag.ParentID, parent.ID)
	}
}

func TestCannotCreateTagWithMissingParent(t *testing.T) {
	app := newApp(t, true)

	response := testutils.Request(app, http.MethodPost, "/api/tags", `{"name":"Paris","parentId":"missing"}`)

	testutils.CheckStatus(t, response, http.StatusNotFound)
}

func TestCannotReuseNameUnderSameParent(t *testing.T) {
	app := newApp(t, true)
	parent := createTag(t, app, "France", "")
	createTag(t, app, "Paris", parent.ID)

	response := testutils.Request(app, http.MethodPost, "/api/tags", tagBody(t, " paris ", parent.ID))

	testutils.CheckStatus(t, response, http.StatusConflict)
}

func TestCanListTags(t *testing.T) {
	app := newApp(t, true)
	parent := createTag(t, app, "France", "")
	nested := createTag(t, app, "Paris", parent.ID)

	list := listTags(t, app)

	if len(list) != 2 || list[0] != parent || list[1] != nested {
		t.Fatalf("tags = %+v, want %v", list, []tags.Tag{parent, nested})
	}
}

func TestCanDeleteTag(t *testing.T) {
	app := newApp(t, true)
	parent := createTag(t, app, "France", "")
	tag := createTag(t, app, "Paris", parent.ID)

	response := testutils.Request(app, http.MethodDelete, "/api/tags/"+tag.ID, "")

	testutils.CheckStatus(t, response, http.StatusNoContent)
	list := listTags(t, app)
	if len(list) != 1 || list[0] != parent {
		t.Fatalf("tags after deletion = %+v, want only %v", list, parent)
	}
}

func TestCannotDeleteTagWithNestedTags(t *testing.T) {
	app := newApp(t, true)
	parent := createTag(t, app, "France", "")
	createTag(t, app, "Paris", parent.ID)

	response := testutils.Request(app, http.MethodDelete, "/api/tags/"+parent.ID, "")

	testutils.CheckStatus(t, response, http.StatusConflict)
	var problem struct{ Error string }
	if err := json.Unmarshal(response.Body.Bytes(), &problem); err != nil {
		t.Fatal(err)
	}
	if want := "France can’t be deleted because it has subtags."; problem.Error != want {
		t.Fatalf("message = %q, want %q", problem.Error, want)
	}
}

func TestTagEndpointsRequireOwner(t *testing.T) {
	app := newApp(t, false)
	for _, route := range []struct{ method, path string }{
		{http.MethodGet, "/api/tags"},
		{http.MethodPost, "/api/tags"},
		{http.MethodDelete, "/api/tags/france"},
	} {
		t.Run(route.method, func(t *testing.T) {
			response := testutils.Request(app, route.method, route.path, "")

			testutils.CheckStatus(t, response, http.StatusUnauthorized)
		})
	}
}

func newApp(t *testing.T, owner bool) *http.ServeMux {
	t.Helper()
	mux := http.NewServeMux()
	tags.Register(mux, tags.NewDynamoStore(testutils.NewFakeDynamoClient(t), "test"), func(*http.Request) bool { return owner })
	return mux
}

func createTag(t *testing.T, app http.Handler, name, parentID string) tags.Tag {
	t.Helper()
	response := testutils.Request(app, http.MethodPost, "/api/tags", tagBody(t, name, parentID))
	testutils.CheckStatus(t, response, http.StatusCreated)
	var tag tags.Tag
	if err := json.Unmarshal(response.Body.Bytes(), &tag); err != nil {
		t.Fatal(err)
	}
	if tag.ID == "" {
		t.Fatal("created tag has no ID")
	}
	return tag
}

func tagBody(t *testing.T, name, parentID string) string {
	t.Helper()
	body, err := json.Marshal(map[string]string{"name": name, "parentId": parentID})
	if err != nil {
		t.Fatal(err)
	}
	return string(body)
}

func listTags(t *testing.T, app http.Handler) []tags.Tag {
	t.Helper()
	response := testutils.Request(app, http.MethodGet, "/api/tags", "")
	testutils.CheckStatus(t, response, http.StatusOK)
	var list []tags.Tag
	if err := json.Unmarshal(response.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	return list
}
