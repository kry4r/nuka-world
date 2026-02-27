package vectorstore

import (
	"context"
	"fmt"

	pb "github.com/qdrant/go-client/qdrant"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// QdrantConfig holds connection settings for a Qdrant instance.
type QdrantConfig struct {
	Host string `json:"host"`
	Port int    `json:"port"`
}

// Client wraps gRPC connections to Qdrant's collections and points services.
type Client struct {
	conn        *grpc.ClientConn
	collections pb.CollectionsClient
	points      pb.PointsClient
}

// NewClient dials the Qdrant gRPC endpoint and returns a ready Client.
func NewClient(cfg QdrantConfig) (*Client, error) {
	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("qdrant connect %s: %w", addr, err)
	}
	return &Client{
		conn:        conn,
		collections: pb.NewCollectionsClient(conn),
		points:      pb.NewPointsClient(conn),
	}, nil
}

// EnsureCollection creates the named collection if it does not already exist.
func (c *Client) EnsureCollection(ctx context.Context, name string, dimension uint64) error {
	_, err := c.collections.Get(ctx, &pb.GetCollectionInfoRequest{CollectionName: name})
	if err == nil {
		return nil
	}
	_, err = c.collections.Create(ctx, &pb.CreateCollection{
		CollectionName: name,
		VectorsConfig: &pb.VectorsConfig{
			Config: &pb.VectorsConfig_Params{
				Params: &pb.VectorParams{
					Size:     dimension,
					Distance: pb.Distance_Cosine,
				},
			},
		},
	})
	if err != nil {
		return fmt.Errorf("create collection %s: %w", name, err)
	}
	return nil
}

// Upsert inserts or updates a single point in the given collection.
func (c *Client) Upsert(ctx context.Context, collection string, id string, vector []float32, payload map[string]string) error {
	payloadMap := make(map[string]*pb.Value)
	for k, v := range payload {
		payloadMap[k] = &pb.Value{Kind: &pb.Value_StringValue{StringValue: v}}
	}
	_, err := c.points.Upsert(ctx, &pb.UpsertPoints{
		CollectionName: collection,
		Points: []*pb.PointStruct{
			{
				Id:      &pb.PointId{PointIdOptions: &pb.PointId_Uuid{Uuid: id}},
				Vectors: &pb.Vectors{VectorsOptions: &pb.Vectors_Vector{Vector: &pb.Vector{Data: vector}}},
				Payload: payloadMap,
			},
		},
	})
	return err
}

// Search performs a nearest-neighbor search and returns the top-K results.
func (c *Client) Search(ctx context.Context, collection string, vector []float32, topK uint64) ([]*SearchResult, error) {
	resp, err := c.points.Search(ctx, &pb.SearchPoints{
		CollectionName: collection,
		Vector:         vector,
		Limit:          topK,
		WithPayload:    &pb.WithPayloadSelector{SelectorOptions: &pb.WithPayloadSelector_Enable{Enable: true}},
	})
	if err != nil {
		return nil, fmt.Errorf("search %s: %w", collection, err)
	}
	results := make([]*SearchResult, 0, len(resp.Result))
	for _, r := range resp.Result {
		payload := make(map[string]string)
		for k, v := range r.Payload {
			if sv, ok := v.Kind.(*pb.Value_StringValue); ok {
				payload[k] = sv.StringValue
			}
		}
		results = append(results, &SearchResult{
			ID:      r.Id.GetUuid(),
			Score:   r.Score,
			Payload: payload,
		})
	}
	return results, nil
}

// SearchResult holds a single vector search hit.
type SearchResult struct {
	ID      string
	Score   float32
	Payload map[string]string
}

// Close tears down the underlying gRPC connection.
func (c *Client) Close() error {
	return c.conn.Close()
}
