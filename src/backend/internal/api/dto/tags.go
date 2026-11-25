package dto

type CreateTagRequest struct {
	Name     string `json:"name"`
	ParentID string `json:"parentId"`
}
