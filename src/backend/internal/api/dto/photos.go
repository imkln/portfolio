package dto

import (
	"slices"
	"strings"
	"unicode"

	"github.com/imkln/portfolio/src/backend/internal/domain/photos"
)

type PhotoUploadRequest struct {
	Name        string `json:"name"`
	ContentType string `json:"contentType"`
	Size        int64  `json:"size"`
}

func (file PhotoUploadRequest) Valid() bool {
	return file.ContentType == photos.JPEGType && file.Size > 0 && file.Size <= photos.MaxUploadBytes &&
		len(file.Name) <= 255 && strings.TrimSpace(file.Name) != "" &&
		!strings.ContainsAny(file.Name, "/\\") && strings.IndexFunc(file.Name, unicode.IsControl) < 0
}

type PhotoPage struct {
	Photos        []photos.Photo `json:"photos"`
	NextPageToken string         `json:"nextPageToken,omitempty"`
}

type PhotoTagEdit struct {
	PhotoIDs     []string `json:"photoIds"`
	AddTagIDs    []string `json:"addTagIds"`
	RemoveTagIDs []string `json:"removeTagIds"`
}

func (edit PhotoTagEdit) Valid() bool {
	return len(edit.PhotoIDs) > 0 && len(edit.PhotoIDs) <= photos.MaxTagEditPhotos &&
		len(edit.AddTagIDs)+len(edit.RemoveTagIDs) > 0 && photos.UniqueIDs(edit.PhotoIDs) &&
		photos.UniqueIDs(append(slices.Clone(edit.AddTagIDs), edit.RemoveTagIDs...))
}
