package collections_test

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/imkln/portfolio/src/backend/tests/utils"
)

func CollectionReadUnavailable(t *testing.T, request utils.APIRequest) {
	t.Helper()
	utils.CheckAPIResponse(t, request, "GET", "/api/collections", "", 500)
}

func CollectionWriteUnavailable(t *testing.T, request utils.APIRequest, replacement string) {
	t.Helper()

	before := utils.CheckAPIResponse(t, request, "GET", "/api/collections", "", 200)
	utils.CheckAPIResponse(t, request, "PUT", "/api/collections", replacement, 500)
	after := utils.CheckAPIResponse(t, request, "GET", "/api/collections", "", 200)
	if !sameJSON(before, after) {
		t.Fatalf("failed collection replacement changed the list from %s to %s", before, after)
	}
}

func CollectionWriteConflict(t *testing.T, request utils.APIRequest, replacement string) {
	t.Helper()
	utils.CheckAPIResponse(t, request, "PUT", "/api/collections", replacement, 409)
}

func sameJSON(left, right []byte) bool {
	var a, b any
	return json.Unmarshal(left, &a) == nil && json.Unmarshal(right, &b) == nil && reflect.DeepEqual(a, b)
}
