import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing auto shop invoices and understanding purchase patterns. Always respond with valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const result = JSON.parse(content) as ContextClassificationResult;
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

