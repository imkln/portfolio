package photos

import (
	"context"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const (
	readyState       = "ready"
	DeletingState    = "deleting" // Photos left by the previous deletion flow.
	DeletedState     = "deleted"
	uploadTimeLayout = "2006-01-02T15:04:05.000000000Z"
)

var ErrInvalidPageToken = errors.New("invalid page token")

type dynamoClient interface {
	TransactWriteItems(context.Context, *dynamodb.TransactWriteItemsInput, ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error)
	Query(context.Context, *dynamodb.QueryInput, ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error)
	GetItem(context.Context, *dynamodb.GetItemInput, ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error)
	UpdateItem(context.Context, *dynamodb.UpdateItemInput, ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error)
}

type dynamoStore struct {
	client dynamoClient
	table  string
}

func NewDynamoStore(client dynamoClient, table string) *dynamoStore {
	return &dynamoStore{client: client, table: table}
}

func (store *dynamoStore) ListReady(ctx context.Context, pageToken string, limit int32) ([]Photo, string, error) {
	input := &dynamodb.QueryInput{
		TableName:              aws.String(store.table),
		IndexName:              aws.String("photos-by-state"),
		KeyConditionExpression: aws.String("#state = :state"),
		ExpressionAttributeNames: map[string]string{
			"#state": "state",
		},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":state": &types.AttributeValueMemberS{Value: readyState},
		},
		ScanIndexForward: aws.Bool(false),
		Limit:            aws.Int32(limit),
	}
	if pageToken != "" {
		after, id, err := readPageToken(pageToken)
		if err != nil {
			return nil, "", err
		}
		input.ExclusiveStartKey = map[string]types.AttributeValue{
			"id":        &types.AttributeValueMemberS{Value: id},
			"state":     &types.AttributeValueMemberS{Value: readyState},
			"uploadKey": &types.AttributeValueMemberS{Value: after},
		}
	}

	result, err := store.client.Query(ctx, input)
	if err != nil {
		return nil, "", err
	}

	items := make([]Photo, 0, len(result.Items))
	for _, item := range result.Items {
		id, hasID := item["id"].(*types.AttributeValueMemberS)
		name, hasName := item["name"].(*types.AttributeValueMemberS)
		stamp, hasStamp := item["uploadedAt"].(*types.AttributeValueMemberS)
		if !hasID || !hasName || !hasStamp {
			return nil, "", errors.New("stored photo is missing metadata")
		}
		uploadedAt, err := time.Parse(time.RFC3339Nano, stamp.Value)
		if err != nil {
			return nil, "", errors.New("stored photo has an invalid upload time")
		}

		items = append(items, Photo{ID: id.Value, Name: name.Value, UploadedAt: uploadedAt, TagIDs: readTagIDs(item)})
	}

	var next string
	if len(result.LastEvaluatedKey) > 0 {
		key, ok := result.LastEvaluatedKey["uploadKey"].(*types.AttributeValueMemberS)
		if !ok {
			return nil, "", errors.New("photo query is missing the last upload key")
		}
		next = base64.RawURLEncoding.EncodeToString([]byte(key.Value))
	}
	return items, next, nil
}

func readPageToken(token string) (key, id string, err error) {
	if len(token) > base64.RawURLEncoding.EncodedLen(len(uploadTimeLayout)+1+128) {
		return "", "", ErrInvalidPageToken
	}

	data, err := base64.RawURLEncoding.Strict().DecodeString(token)
	if err != nil {
		return "", "", ErrInvalidPageToken
	}

	key = string(data)
	stamp, id, ok := strings.Cut(key, "#")
	if !ok || len(stamp) != len(uploadTimeLayout) || !ValidID(id) {
		return "", "", ErrInvalidPageToken
	}
	if _, err := time.Parse(uploadTimeLayout, stamp); err != nil {
		return "", "", ErrInvalidPageToken
	}
	return key, id, nil
}

func (store *dynamoStore) IsReady(ctx context.Context, id string) (bool, error) {
	state, err := store.PhotoState(ctx, id)
	return state == readyState, err
}

func (store *dynamoStore) PhotoState(ctx context.Context, id string) (string, error) {
	result, err := store.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName:            aws.String(store.table),
		Key:                  photoKey(id),
		ConsistentRead:       aws.Bool(true),
		ProjectionExpression: aws.String("#state"),
		ExpressionAttributeNames: map[string]string{
			"#state": "state",
		},
	})
	if err != nil {
		return "", err
	}

	state, ok := result.Item["state"].(*types.AttributeValueMemberS)
	if !ok {
		return "", nil
	}
	return state.Value, nil
}

func (store *dynamoStore) CanDelete(ctx context.Context, id string) (bool, error) {
	state, err := store.PhotoState(ctx, id)
	return state == readyState || state == DeletingState || state == DeletedState, err
}

func (store *dynamoStore) MarkDeleted(ctx context.Context, id string) (bool, error) {
	_, err := store.client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:           aws.String(store.table),
		Key:                 photoKey(id),
		ConditionExpression: aws.String("#state IN (:ready, :deleting, :deleted)"),
		UpdateExpression:    aws.String("SET #state = :deleted REMOVE #name, uploadedAt, uploadKey, tagIds"),
		ExpressionAttributeNames: map[string]string{
			"#state": "state",
			"#name":  "name",
		},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":ready":    &types.AttributeValueMemberS{Value: readyState},
			":deleting": &types.AttributeValueMemberS{Value: DeletingState},
			":deleted":  &types.AttributeValueMemberS{Value: DeletedState},
		},
	})
	if _, ok := errors.AsType[*types.ConditionalCheckFailedException](err); ok {
		return false, nil
	}
	return err == nil, err
}

func (store *dynamoStore) SaveReady(ctx context.Context, photo Photo) (bool, error) {
	uploadedAt := photo.UploadedAt.UTC()
	_, err := store.client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:           aws.String(store.table),
		Key:                 photoKey(photo.ID),
		ConditionExpression: aws.String("attribute_not_exists(id)"),
		UpdateExpression:    aws.String("SET #state = :ready, #name = :name, uploadedAt = :time, uploadKey = :key"),
		ExpressionAttributeNames: map[string]string{
			"#state": "state",
			"#name":  "name",
		},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":ready": &types.AttributeValueMemberS{Value: readyState},
			":name":  &types.AttributeValueMemberS{Value: photo.Name},
			":time":  &types.AttributeValueMemberS{Value: uploadedAt.Format(time.RFC3339Nano)},
			":key":   &types.AttributeValueMemberS{Value: uploadedAt.Format(uploadTimeLayout) + "#" + photo.ID},
		},
	})
	if _, ok := errors.AsType[*types.ConditionalCheckFailedException](err); ok {
		return false, nil
	}
	return err == nil, err
}

func photoKey(id string) map[string]types.AttributeValue {
	return map[string]types.AttributeValue{"id": &types.AttributeValueMemberS{Value: id}}
}
