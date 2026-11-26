package tags

import "errors"

type Tag struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	ParentID string `json:"parentId,omitempty"`
}

var (
	ErrInvalidName    = errors.New("invalid tag name")
	ErrMissingParent  = errors.New("parent tag missing")
	ErrUnknownTag     = errors.New("tag missing")
	ErrDuplicateName  = errors.New("duplicate sibling tag name")
	ErrCatalogChanged = errors.New("tag catalog changed")
	ErrCatalogFull    = errors.New("tag catalog full")
)

type HasSubtags struct {
	Name string
}

func (*HasSubtags) Error() string { return "tag has subtags" }
