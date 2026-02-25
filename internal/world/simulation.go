package world

import (
	"context"
	"sync"
	"time"

	"go.uber.org/zap"
)

// ClockListener receives world tick events.
type ClockListener interface {
	OnTick(worldTime time.Time)
}

// WorldClock drives the simulation with configurable tick rate and time speed.
type WorldClock struct {
	speed     float64 // time multiplier, 1.0 = realtime
	interval  time.Duration
	listeners []ClockListener
	worldTime time.Time
	mu        sync.RWMutex
	cancel    context.CancelFunc
	logger    *zap.Logger
}

// NewWorldClock creates a clock with the given tick interval and speed multiplier.
func NewWorldClock(interval time.Duration, speed float64, logger *zap.Logger) *WorldClock {
	return &WorldClock{
		speed:     speed,
		interval:  interval,
		worldTime: time.Now(),
		logger:    logger,
	}
}

// AddListener registers a tick listener.
func (c *WorldClock) AddListener(l ClockListener) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.listeners = append(c.listeners, l)
}

// WorldTime returns the current simulated world time.
func (c *WorldClock) WorldTime() time.Time {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.worldTime
}

// SetSpeed changes the time multiplier.
func (c *WorldClock) SetSpeed(speed float64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.speed = speed
}

// Start begins the tick loop in a background goroutine.
func (c *WorldClock) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	c.cancel = cancel
	go c.loop(ctx)
	c.logger.Info("world clock started",
		zap.Duration("interval", c.interval),
		zap.Float64("speed", c.speed))
}

// Stop halts the tick loop.
func (c *WorldClock) Stop() {
	if c.cancel != nil {
		c.cancel()
		c.logger.Info("world clock stopped")
	}
}

func (c *WorldClock) loop(ctx context.Context) {
	ticker := time.NewTicker(c.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.tick()
		}
	}
}

func (c *WorldClock) tick() {
	c.mu.Lock()
	c.worldTime = c.worldTime.Add(
		time.Duration(float64(c.interval) * c.speed),
	)
	wt := c.worldTime
	listeners := make([]ClockListener, len(c.listeners))
	copy(listeners, c.listeners)
	c.mu.Unlock()

	for _, l := range listeners {
		l.OnTick(wt)
	}
}
