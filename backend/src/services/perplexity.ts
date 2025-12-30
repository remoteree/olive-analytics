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
    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      {
        model: 'llama-3.1-sonar-large-128k-online',
        messages: [
          {
            role: 'system',
            content: 'You are a procurement expert helping auto shops save money. Always respond with valid JSON arrays.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const content = response.data.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from Perplexity');
    }

    // Parse JSON from response (may need cleaning)
    const cleanedContent = content.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const recommendations = JSON.parse(cleanedContent) as SavingsRecommendation[];
    
    return Array.isArray(recommendations) ? recommendations : [];
  } catch (error) {
    console.error('Error generating savings recommendations:', error);
    return [];
  }
}

