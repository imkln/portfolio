package dto

import "github.com/imkln/portfolio/src/backend/internal/domain/collections"

type Collection struct {
	collections.Collection
	CoverPhotoURL string `json:"coverPhotoUrl,omitempty"`
}

type CollectionItem struct {
	collections.CollectionItem
	CoverPhotoURL string `json:"coverPhotoUrl,omitempty"`
}

type CollectionDetail struct {
	Collection
	Items []CollectionItem `json:"items"`
}

type CollectionList struct {
	Collections []Collection `json:"collections"`
}

type ReplaceCollectionItems struct {
	Items collections.Items `json:"items"`
}
