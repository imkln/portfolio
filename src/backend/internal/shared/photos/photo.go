package photos

import (
	"errors"
	"regexp"
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
