import axios from 'axios';

export interface SavingsRange {
  min: number;
  max: number;
}

export interface SavingsRecommendation {
  type: 'alternative_supplier' | 'bulk_order' | 'price_match' | 'other';
  title: string;
  description: string;
  potentialSavings?: number; // Legacy field for backward compatibility
  savingsRange?: SavingsRange; // New: dollar amount range
  savingsPercentRange?: SavingsRange; // New: percentage range (0-100)
  confidence: number;
  evidence: string[];
  actionSteps: string[]; // New: specific steps to achieve savings
  estimatedTimeToImplement?: string; // New: e.g., "1-2 weeks", "immediate"
}

export async function generateSavingsRecommendations(
  supplierName: string,
  lineItems: Array<{ description: string; sku?: string; quantity: number; unitPrice: number }>,
  totals: { total: number }
): Promise<SavingsRecommendation[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  
  if (!apiKey) {
    console.warn('Perplexity API key not configured, returning empty recommendations');
    return [];
  }

  const itemsDescription = lineItems
    .map((item) => `${item.description}${item.sku ? ` (SKU: ${item.sku})` : ''} - $${item.unitPrice.toFixed(2)}`)
    .join(', ');

  const prompt = `An auto shop purchased parts from ${supplierName}:
${itemsDescription}
Total: $${totals.total.toFixed(2)}

Provide actionable savings recommendations. Consider:
1. Alternative suppliers with better pricing (RockAuto, PartsGeek, CarParts.com, etc.)
2. Bulk order opportunities (volume discounts)
3. Price matching strategies (calling suppliers to match competitor prices)
4. Other cost-saving opportunities

For each recommendation, provide a JSON object with:
- type: "alternative_supplier" | "bulk_order" | "price_match" | "other"
- title: Short descriptive title
- description: Detailed explanation of the recommendation
- savingsRange: { min: number, max: number } - Estimated dollar savings range (e.g., { min: 50, max: 150 })
- savingsPercentRange: { min: number, max: number } - Estimated percentage savings range (0-100, e.g., { min: 5, max: 15 })
- confidence: Number between 0-1 (how confident you are in this recommendation)
- evidence: Array of strings with specific sources, prices, or data points
- actionSteps: Array of specific actionable steps to achieve these savings (e.g., ["Call RockAuto and request quote for SKU BP-12345", "Compare pricing with PartsGeek", "Negotiate bulk discount for orders over $500"])
- estimatedTimeToImplement: String describing time needed (e.g., "1-2 weeks", "immediate", "2-4 weeks")

IMPORTANT: 
- Provide realistic savings ranges based on typical auto parts pricing
- For alternative_supplier: savings typically 5-25% ($50-$500 for orders this size)
- For bulk_order: savings typically 10-30% ($100-$600 for orders this size) 
- For price_match: savings typically 3-15% ($30-$300 for orders this size)
- Include specific action steps that can be taken immediately
- Use actual supplier names and realistic price comparisons

Respond with a JSON array of recommendations only, no additional text or markdown.`;

  try {
    // Use a model that's available in Perplexity API
    // Common models: llama-3.1-sonar-small-128k-online, llama-3.1-sonar-large-128k-online, 
    // sonar, sonar-pro, etc.
    const model = process.env.PERPLEXITY_MODEL || 'llama-3.1-sonar-small-128k-online';
    
    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      {
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a procurement expert helping auto shops save money. Always respond with valid JSON arrays only, no additional text or markdown.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 second timeout
      }
    );

    const content = response.data.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from Perplexity');
    }

    // Parse JSON from response (may need cleaning)
    let cleanedContent = content.trim();
    
    // Remove markdown code blocks if present
    cleanedContent = cleanedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Try to extract JSON array if wrapped in other text
    const jsonArrayMatch = cleanedContent.match(/\[[\s\S]*\]/);
    if (jsonArrayMatch) {
      cleanedContent = jsonArrayMatch[0];
    }
    
    let recommendations: SavingsRecommendation[];
    try {
      recommendations = JSON.parse(cleanedContent) as SavingsRecommendation[];
    } catch (parseError) {
      console.error('Failed to parse Perplexity response as JSON:', cleanedContent.substring(0, 200));
      // Return empty array if parsing fails
      return [];
    }
    
    // Validate and return
    if (!Array.isArray(recommendations)) {
      console.warn('Perplexity response is not an array, wrapping in array');
      recommendations = [recommendations as any];
    }
    
    // Validate structure and ensure required fields
    const validatedRecommendations = recommendations
      .filter(rec => 
        rec && 
        typeof rec === 'object' && 
        rec.type && 
        rec.title && 
        rec.description
      )
      .map(rec => {
        // Ensure actionSteps exists
        if (!rec.actionSteps || !Array.isArray(rec.actionSteps)) {
          rec.actionSteps = [];
        }
        // Calculate potentialSavings from savingsRange if not provided (for backward compatibility)
        if (!rec.potentialSavings && rec.savingsRange) {
          rec.potentialSavings = (rec.savingsRange.min + rec.savingsRange.max) / 2;
        }
        // Ensure confidence is a number
        if (typeof rec.confidence !== 'number' || isNaN(rec.confidence)) {
          rec.confidence = 0.5; // Default confidence
        }
        return rec;
      });
    
    return validatedRecommendations;
  } catch (error: any) {
    console.error('Error generating savings recommendations:', error.message || error);
    if (error.response) {
      console.error('Perplexity API error response:', error.response.data);
    }
    return [];
  }
}

export interface RecommendationSummary {
  totalSavingsRange: SavingsRange;
  totalSavingsPercentRange: SavingsRange;
  estimatedTotalSavings: number; // Average of min/max
  estimatedTotalSavingsPercent: number; // Average percentage
  combinedActionSteps: string[];
  recommendationCount: number;
}

export function calculateRecommendationSummary(
  recommendations: SavingsRecommendation[],
  invoiceTotal: number
): RecommendationSummary {
  if (recommendations.length === 0) {
    return {
      totalSavingsRange: { min: 0, max: 0 },
      totalSavingsPercentRange: { min: 0, max: 0 },
      estimatedTotalSavings: 0,
      estimatedTotalSavingsPercent: 0,
      combinedActionSteps: [],
      recommendationCount: 0,
    };
  }

  // Aggregate savings ranges
  let totalMinSavings = 0;
  let totalMaxSavings = 0;
  let totalMinPercent = 0;
  let totalMaxPercent = 0;
  const allActionSteps: string[] = [];

  recommendations.forEach(rec => {
    if (rec.savingsRange) {
      totalMinSavings += rec.savingsRange.min;
      totalMaxSavings += rec.savingsRange.max;
    } else if (rec.potentialSavings) {
      // Fallback to potentialSavings if range not available
      const estimatedSavings = rec.potentialSavings;
      totalMinSavings += estimatedSavings * 0.8; // Assume 20% variance
      totalMaxSavings += estimatedSavings * 1.2;
    }

    if (rec.savingsPercentRange) {
      totalMinPercent += rec.savingsPercentRange.min;
      totalMaxPercent += rec.savingsPercentRange.max;
    } else if (rec.potentialSavings && invoiceTotal > 0) {
      // Calculate percentage from dollar amount
      const percent = (rec.potentialSavings / invoiceTotal) * 100;
      totalMinPercent += percent * 0.8;
      totalMaxPercent += percent * 1.2;
    }

    if (rec.actionSteps && Array.isArray(rec.actionSteps)) {
      allActionSteps.push(...rec.actionSteps);
    }
  });

  // Cap percentage at 100%
  totalMaxPercent = Math.min(totalMaxPercent, 100);

  const estimatedTotalSavings = (totalMinSavings + totalMaxSavings) / 2;
  const estimatedTotalSavingsPercent = (totalMinPercent + totalMaxPercent) / 2;

  // Remove duplicate action steps
  const uniqueActionSteps = Array.from(new Set(allActionSteps));

  return {
    totalSavingsRange: { min: totalMinSavings, max: totalMaxSavings },
    totalSavingsPercentRange: { min: totalMinPercent, max: totalMaxPercent },
    estimatedTotalSavings,
    estimatedTotalSavingsPercent,
    combinedActionSteps: uniqueActionSteps,
    recommendationCount: recommendations.length,
  };
}

