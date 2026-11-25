package tags_test

import (
	"fmt"
	"net/url"
	"testing"

	"github.com/imkln/portfolio/src/backend/tests/utils"
)

func TestSaveAndValidateTagHierarchy(t *testing.T) {
	owner, _ := utils.StartBackend(t)
	parent := owner.CreateTag(t, "Alpine Region", "")
	parentPath := "/api/tags/" + url.PathEscape(parent)
	t.Cleanup(func() { owner.Request(t, "DELETE", parentPath, "", 204) })
	child := owner.CreateTag(t, "Alpine Lake", parent)
	t.Cleanup(func() { owner.Request(t, "DELETE", "/api/tags/"+url.PathEscape(child), "", 204) })
	owner.Request(t, "DELETE", parentPath, "", 409)
	owner.Request(t, "POST", "/api/tags", `{"name":"Orphan","parentId":"missing-tag"}`, 404)
	owner.Request(t, "POST", "/api/tags", fmt.Sprintf(`{"name":"alpine lake","parentId":%q}`, parent), 409)
	var catalog []struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		ParentID string `json:"parentId"`
	}
	utils.Decode(t, owner.Request(t, "GET", "/api/tags", "", 200), &catalog)
	found := false
	for _, tag := range catalog {
		if tag.ID == child && tag.Name == "Alpine Lake" && tag.ParentID == parent {
			found = true
		}
	}
	if !found {
		t.Fatal("tag catalog did not return the saved child with its parent")
	}

}
