package photos

import (
	"errors"
	"regexp"
	"time"
)

const (
	JPEGType         = "image/jpeg"
	MaxUploadBytes   = 64 << 20
	UploadTimeLayout = "2006-01-02T15:04:05.000000000Z"
)

var (
	ErrInvalidUpload = errors.New("invalid photo upload")
	photoID          = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)
)

type Photo struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	UploadedAt time.Time `json:"uploadedAt"`
}

func ValidID(id string) bool {
	return photoID.MatchString(id)
}
