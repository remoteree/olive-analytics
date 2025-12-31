import axios from 'axios';

export interface SavingsRecommendation {
  type: 'alternative_supplier' | 'bulk_order' | 'price_match' | 'other';
  title: string;
  description: string;
  potentialSavings?: number;
  confidence: number;
  evidence: string[];
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
1. Alternative suppliers with better pricing
2. Bulk order opportunities
3. Price matching strategies
4. Other cost-saving opportunities

For each recommendation, provide:
- Type (alternative_supplier, bulk_order, price_match, or other)
- Title
- Description
- Potential savings estimate (if applicable)
- Confidence level (0-1)
- Evidence/sources

Respond with a JSON array of recommendations.`;

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
    
    // Validate structure
    return recommendations.filter(rec => 
      rec && 
      typeof rec === 'object' && 
      rec.type && 
      rec.title && 
      rec.description
    );
  } catch (error: any) {
    console.error('Error generating savings recommendations:', error.message || error);
    if (error.response) {
      console.error('Perplexity API error response:', error.response.data);
    }
    return [];
  }
}

