import Shop from '../models/Shop';
import Supplier from '../models/Supplier';
import Part from '../models/Part';

export async function resolveOrCreateShop(shopId: string, shopName?: string): Promise<string> {
  let shop = await Shop.findOne({ shopId });
  
  if (!shop) {
    shop = new Shop({
      shopId,
      name: shopName || shopId,
    });
    await shop.save();
  }
  
  return shop._id.toString();
}

export async function resolveOrCreateSupplier(supplierName: string): Promise<string> {
  // Normalize supplier name (lowercase, trim)
  const normalizedName = supplierName.toLowerCase().trim();
  
  // Try to find existing supplier by normalized name or aliases
  let supplier = await Supplier.findOne({
    $or: [
      { normalizedName },
      { aliases: { $in: [normalizedName, supplierName] } },
    ],
  });
  
  if (!supplier) {
    supplier = new Supplier({
      normalizedName,
      aliases: [supplierName],
    });
    await supplier.save();
  } else {
    // Add alias if not already present
    if (!supplier.aliases.includes(supplierName)) {
      supplier.aliases.push(supplierName);
      await supplier.save();
    }
  }
  
  return supplier._id.toString();
}

export async function resolveOrCreateParts(
  lineItems: Array<{ description: string; sku?: string }>
): Promise<void> {
  for (const item of lineItems) {
    const normalizedDesc = item.description.toLowerCase().trim();
    
    // Try to find existing part by description or SKU
    let part = await Part.findOne({
      $or: [
        { normalizedDesc },
        ...(item.sku ? [{ sku: item.sku }] : []),
      ],
    });
    
    if (!part) {
      part = new Part({
        normalizedDesc,
        sku: item.sku,
      });
      await part.save();
    } else {
      // Update SKU if missing
      if (!part.sku && item.sku) {
        part.sku = item.sku;
        await part.save();
      }
    }
  }
}

