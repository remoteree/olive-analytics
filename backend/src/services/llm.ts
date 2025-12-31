import OpenAI from 'openai';

// Lazy initialization - only create client when needed
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    openai = new OpenAI({
      apiKey,
    });
  }
  return openai;
}

export interface ContextClassificationResult {
  purchaseType: 'routine' | 'rush' | 'specialty';
  constraints: {
    speed?: boolean;
    availability?: boolean;
    relationship?: boolean;
  };
  confidence: number;
  explanation: string;
}

export async function classifyPurchaseContext(
  supplierName: string,
  lineItems: Array<{ description: string; quantity: number; unitPrice: number }>,
  invoiceDate: Date,
  totals: { total: number }
): Promise<ContextClassificationResult> {
  const prompt = `Analyze this auto shop invoice and classify the purchase context.

Supplier: ${supplierName}
Invoice Date: ${invoiceDate.toISOString().split('T')[0]}
Total Amount: $${totals.total.toFixed(2)}
Line Items:
${lineItems.map((item, idx) => `${idx + 1}. ${item.description} - Qty: ${item.quantity} - Price: $${item.unitPrice.toFixed(2)}`).join('\n')}

Classify this purchase as one of:
- routine: Standard, planned purchase
- rush: Urgent/time-sensitive order
- specialty: Unusual or specialized parts/equipment

Also identify constraints:
- speed: Time-sensitive delivery needed
- availability: Limited availability/hard-to-find items
- relationship: Supplier relationship factors important

Respond with a JSON object:
{
  "purchaseType": "routine" | "rush" | "specialty",
  "constraints": {
    "speed": boolean,
    "availability": boolean,
    "relationship": boolean
  },
  "confidence": number (0-1),
  "explanation": "brief explanation"
}`;

  try {
    const client = getOpenAIClient();
    // Use a model that supports JSON mode
    // Models that support JSON mode: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4-1106-preview, gpt-3.5-turbo-1106+
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    
    // Check if model supports JSON mode (newer models)
    const supportsJsonMode = model.includes('gpt-4o') || 
                            model.includes('gpt-4-turbo') || 
                            model.includes('gpt-4-1106') ||
                            model.includes('gpt-3.5-turbo-1106') ||
                            model.includes('gpt-3.5-turbo-16') ||
                            model.includes('gpt-3.5-turbo-0125');
    
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing auto shop invoices and understanding purchase patterns. Always respond with valid JSON only, no additional text or markdown.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      // Only use JSON mode if model supports it
      ...(supportsJsonMode ? { response_format: { type: 'json_object' } } : {}),
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Parse JSON - handle both JSON mode and text responses
    let result: ContextClassificationResult;
    try {
      // Try parsing directly
      result = JSON.parse(content) as ContextClassificationResult;
    } catch (parseError) {
      // If direct parse fails, try extracting JSON from markdown code blocks
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[1]) as ContextClassificationResult;
      } else {
        // Last resort: try to find JSON object in the text
        const jsonObjectMatch = content.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          result = JSON.parse(jsonObjectMatch[0]) as ContextClassificationResult;
        } else {
          throw new Error('Could not parse JSON from response');
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error('Error classifying purchase context:', error);
    // Return default classification on error
    return {
      purchaseType: 'routine',
      constraints: {},
      confidence: 0.5,
      explanation: 'Classification failed, defaulting to routine',
    };
  }
}

