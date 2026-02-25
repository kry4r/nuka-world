package memory

import (
	"math"
	"sort"
	"strings"
)

// keywordSimilarity computes overlap between keywords and schema text.
// Uses a combination of exact match ratio and TF-like weighting.
func keywordSimilarity(keywords []string, name, description string) float64 {
	if len(keywords) == 0 {
		return 0
	}

	target := strings.ToLower(name + " " + description)
	targetWords := tokenize(target)
	targetSet := make(map[string]bool, len(targetWords))
	for _, w := range targetWords {
		targetSet[w] = true
	}

	var matched int
	var weightedScore float64
	for _, kw := range keywords {
		kwLower := strings.ToLower(kw)
		if targetSet[kwLower] {
			matched++
			weightedScore += 1.0
		} else if strings.Contains(target, kwLower) {
			matched++
			weightedScore += 0.7 // partial substring match
		}
	}

	if matched == 0 {
		return 0
	}

	// Jaccard-inspired: overlap / union
	overlap := float64(matched)
	union := float64(len(keywords) + len(targetSet) - matched)
	jaccard := overlap / math.Max(union, 1)

	// Coverage: what fraction of input keywords matched
	coverage := weightedScore / float64(len(keywords))

	// Blend both signals
	return 0.4*jaccard + 0.6*coverage
}

// tokenize splits text into lowercase word tokens.
func tokenize(text string) []string {
	fields := strings.FieldsFunc(text, func(r rune) bool {
		return !((r >= 'a' && r <= 'z') ||
			(r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') ||
			r == '_' || r == '-' ||
			r > 127) // keep unicode chars
	})
	result := make([]string, 0, len(fields))
	for _, f := range fields {
		w := strings.ToLower(f)
		if len(w) > 1 { // skip single chars
			result = append(result, w)
		}
	}
	return result
}

// sortMatchResults sorts by score descending.
func sortMatchResults(results []MatchResult) {
	sort.Slice(results, func(i, j int) bool {
		return results[i].Score > results[j].Score
	})
}
