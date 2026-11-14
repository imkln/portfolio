package tags

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"unicode"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

var (
	errInvalidName    = errors.New("invalid tag name")
	errMissingParent  = errors.New("parent tag missing")
	ErrUnknownTag     = errors.New("tag missing")
	errDuplicateName  = errors.New("duplicate sibling tag name")
	errCatalogChanged = errors.New("tag catalog changed")
	errCatalogFull    = errors.New("tag catalog full")
)

type hasSubtags struct {
	name string
}

func (*hasSubtags) Error() string { return "tag has subtags" }

type dynamoStore struct {
	client *dynamodb.Client
	table  string
}

func NewDynamoStore(client *dynamodb.Client, table string) *dynamoStore {
	return &dynamoStore{client: client, table: table}
}

func (store *dynamoStore) List(ctx context.Context) ([]Tag, error) {
	tags, _, err := store.load(ctx)
	return tags, err
}

// CheckAssignment validates additions and returns the condition that keeps the
// catalog snapshot valid until the photo transaction commits.
func (store *dynamoStore) CheckAssignment(ctx context.Context, ids []string) (*types.ConditionCheck, error) {
	tags, previous, err := store.load(ctx)
	if err != nil {
		return nil, err
	}
	known := make(map[string]bool, len(tags))
	for _, tag := range tags {
		known[tag.ID] = true
	}
	for _, id := range ids {
		if !known[id] {
			return nil, ErrUnknownTag
		}
	}

	return &types.ConditionCheck{
		TableName:                aws.String(store.table),
		Key:                      catalogKey(),
		ConditionExpression:      aws.String("#tags = :previous"),
		ExpressionAttributeNames: map[string]string{"#tags": "tags"},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":previous": &types.AttributeValueMemberS{Value: *previous},
		},
	}, nil
}

func catalogKey() map[string]types.AttributeValue {
	return map[string]types.AttributeValue{"id": &types.AttributeValueMemberS{Value: "tags"}}
}

func (store *dynamoStore) load(ctx context.Context) ([]Tag, *string, error) {
	var tags []Tag
	result, err := store.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName:      aws.String(store.table),
		Key:            catalogKey(),
		ConsistentRead: aws.Bool(true),
	})
	if err != nil || len(result.Item) == 0 {
		return tags, nil, err
	}

	value, ok := result.Item["tags"].(*types.AttributeValueMemberS)
	if !ok {
		return tags, nil, errors.New("stored tag list is missing")
	}

	err = json.Unmarshal([]byte(value.Value), &tags)
	return tags, &value.Value, err
}

func (store *dynamoStore) Create(ctx context.Context, name, parentID string) (Tag, error) {
	name = strings.TrimSpace(name)
	if name == "" || len([]rune(name)) > 90 || strings.ContainsAny(name, "›>") || strings.ContainsFunc(name, unicode.IsControl) {
		return Tag{}, errInvalidName
	}

	tags, previous, err := store.load(ctx)
	if err != nil {
		return Tag{}, err
	}
	if parentID != "" && tagIndex(tags, parentID) == -1 {
		return Tag{}, errMissingParent
	}
	for _, existing := range tags {
		if existing.ParentID == parentID && strings.EqualFold(existing.Name, name) {
			return Tag{}, errDuplicateName
		}
	}

	tag := Tag{ID: rand.Text(), Name: name, ParentID: parentID}
	if err := store.save(ctx, append(tags, tag), previous); err != nil {
		return Tag{}, err
	}
	return tag, nil
}

func (store *dynamoStore) Delete(ctx context.Context, id string) error {
	tags, previous, err := store.load(ctx)
	if err != nil {
		return err
	}
	index := tagIndex(tags, id)
	if index == -1 {
		return ErrUnknownTag
	}
	for _, tag := range tags {
		if tag.ParentID == id {
			return &hasSubtags{name: tags[index].Name}
		}
	}
	return store.save(ctx, slices.Delete(tags, index, index+1), previous)
}

func tagIndex(tags []Tag, id string) int {
	return slices.IndexFunc(tags, func(tag Tag) bool { return tag.ID == id })
}

func (store *dynamoStore) save(ctx context.Context, tags []Tag, previous *string) error {
	data, err := json.Marshal(tags)
	if err != nil {
		return err
	}
	if len(data) > 380*1024 {
		return errCatalogFull
	}

	input := &dynamodb.PutItemInput{
		TableName: aws.String(store.table),
		Item: map[string]types.AttributeValue{
			"id":   &types.AttributeValueMemberS{Value: "tags"},
			"tags": &types.AttributeValueMemberS{Value: string(data)},
		},
		ConditionExpression: aws.String("attribute_not_exists(id)"),
	}
	if previous != nil {
		input.ConditionExpression = aws.String("#tags = :previous")
		input.ExpressionAttributeNames = map[string]string{"#tags": "tags"}
		input.ExpressionAttributeValues = map[string]types.AttributeValue{
			":previous": &types.AttributeValueMemberS{Value: *previous},
		}
	}
	_, err = store.client.PutItem(ctx, input)
	var conflict *types.ConditionalCheckFailedException
	if errors.As(err, &conflict) {
		return errCatalogChanged
	}
	return err
}
