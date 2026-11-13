package photos

import (
	"context"
	"errors"
	"slices"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const MaxTagEditPhotos = 100

var (
	ErrPhotoNotFound = errors.New("photo not found")
	ErrTagsChanged   = errors.New("photo tags changed")
)

func readTagIDs(item map[string]types.AttributeValue) []string {
	tags, _ := item["tagIds"].(*types.AttributeValueMemberSS)
	if tags == nil {
		return nil
	}
	return slices.Clone(tags.Value)
}

func (store *dynamoStore) EditTags(ctx context.Context, photoIDs, add, remove []string) error {
	writes := make([]types.TransactWriteItem, 0, len(photoIDs))
	for _, id := range photoIDs {
		item, err := store.client.GetItem(ctx, &dynamodb.GetItemInput{
			TableName:      aws.String(store.table),
			Key:            photoKey(id),
			ConsistentRead: aws.Bool(true),
		})
		if err != nil {
			return err
		}
		state, _ := item.Item["state"].(*types.AttributeValueMemberS)
		if state == nil || state.Value != readyState {
			return ErrPhotoNotFound
		}

		writes = append(writes, types.TransactWriteItem{Update: store.tagUpdate(id, readTagIDs(item.Item), add, remove)})
	}

	_, err := store.client.TransactWriteItems(ctx, &dynamodb.TransactWriteItemsInput{TransactItems: writes})
	if canceled, ok := errors.AsType[*types.TransactionCanceledException](err); ok {
		for _, reason := range canceled.CancellationReasons {
			switch aws.ToString(reason.Code) {
			case "ConditionalCheckFailed", "TransactionConflict":
				return ErrTagsChanged
			}
		}
	}
	return err
}

func (store *dynamoStore) tagUpdate(id string, before, add, remove []string) *types.Update {
	after := slices.DeleteFunc(slices.Clone(before), func(id string) bool {
		return slices.Contains(remove, id)
	})
	for _, id := range add {
		if !slices.Contains(after, id) {
			after = append(after, id)
		}
	}

	update := &types.Update{
		TableName: aws.String(store.table),
		Key:       photoKey(id),
		ExpressionAttributeNames: map[string]string{
			"#state": "state",
		},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":ready": &types.AttributeValueMemberS{Value: readyState},
		},
		ConditionExpression: aws.String("#state = :ready AND attribute_not_exists(tagIds)"),
		UpdateExpression:    aws.String("REMOVE tagIds"),
	}
	if len(before) > 0 {
		update.ConditionExpression = aws.String("#state = :ready AND tagIds = :before")
		update.ExpressionAttributeValues[":before"] = &types.AttributeValueMemberSS{Value: before}
	}
	if len(after) > 0 {
		update.UpdateExpression = aws.String("SET tagIds = :after")
		update.ExpressionAttributeValues[":after"] = &types.AttributeValueMemberSS{Value: after}
	}
	return update
}
