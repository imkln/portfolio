package photos

import (
	"errors"
	"regexp"
	"strings"
	"time"
)

const (
	JPEGType       = "image/jpeg"
	MaxUploadBytes = 64 << 20
)

var (
	ErrInvalidUpload = errors.New("invalid photo upload")
	photoID          = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)
)

type Photo struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	UploadedAt time.Time `json:"uploadedAt"`
	TagIDs     []string  `json:"tagIds,omitempty"`
}

func ValidID(id string) bool {
	return photoID.MatchString(id)
}

type UploadForm struct {
	URL    string            `json:"url"`
	Fields map[string]string `json:"fields"`
}

const UploadPrefix = "uploads/"

func UploadID(key string) (string, bool) {
	name, inUploads := strings.CutPrefix(key, UploadPrefix)
	id, isJPEG := strings.CutSuffix(name, ".jpg")
	return id, inUploads && isJPEG && ValidID(id)
}

const (
	DeletingState = "deleting" // Photos left by the previous deletion flow.
	DeletedState  = "deleted"
)

var ErrInvalidPageToken = errors.New("invalid page token")

const MaxTagEditPhotos = 99 // Reserve one transaction action for the tag catalog.

var (
	ErrPhotoNotFound = errors.New("photo not found")
	ErrTagsChanged   = errors.New("photo tags changed")
)

func UniqueIDs(ids []string) bool {
	seen := make(map[string]bool, len(ids))
	for _, id := range ids {
		if !ValidID(id) || seen[id] {
			return false
		}
		seen[id] = true
	}
	return true
}
