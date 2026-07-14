/** GST is added on top of the selling price (exclusive). */

export const DEFAULT_GST_RATE_PERCENT = 5;



/** @deprecated Use DEFAULT_GST_RATE_PERCENT or per-product gstPercent. */

export const GST_RATE_PERCENT = DEFAULT_GST_RATE_PERCENT;



export function normalizeGstPercent(value?: number | null): number {

  if (value == null || Number.isNaN(value)) return DEFAULT_GST_RATE_PERCENT;

  return Math.min(100, Math.max(0, value));

}



export function productGstPercent(product?: { gstPercent?: number } | null): number {

  return normalizeGstPercent(product?.gstPercent);

}



export function gstOnExclusive(

  sellingAmount: number,

  gstPercent: number = DEFAULT_GST_RATE_PERCENT,

): number {

  if (sellingAmount <= 0) return 0;

  const rate = normalizeGstPercent(gstPercent);

  return sellingAmount * (rate / 100);

}



export function totalWithGst(

  sellingAmount: number,

  gstPercent: number = DEFAULT_GST_RATE_PERCENT,

): number {

  return sellingAmount + gstOnExclusive(sellingAmount, gstPercent);

}



export function sellingPriceWithGst(

  sellingAmount: number,

  gstPercent: number = DEFAULT_GST_RATE_PERCENT,

): {

  gstPercent: number;

  sellingPrice: number;

  gst: number;

  total: number;

} {

  const rate = normalizeGstPercent(gstPercent);

  const gst = gstOnExclusive(sellingAmount, rate);

  return {

    gstPercent: rate,

    sellingPrice: sellingAmount,

    gst,

    total: sellingAmount + gst,

  };

}



export type GstLine = {

  lineTotal: number;

  gstPercent: number;

};



export function saleAmountsFromGstLines(

  lines: GstLine[],

  discount = 0,

  hasGst = false,

): {

  sellingSubtotal: number;

  discount: number;

  netSelling: number;

  gstAmount: number;

  total: number;

} {

  const sellingSubtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  const netDiscount = Math.min(discount, sellingSubtotal);

  const netSelling = sellingSubtotal - netDiscount;



  if (!hasGst || netSelling <= 0) {

    return {

      sellingSubtotal,

      discount: netDiscount,

      netSelling,

      gstAmount: 0,

      total: netSelling,

    };

  }



  let gstAmount = 0;

  if (sellingSubtotal > 0) {

    for (const line of lines) {

      if (line.lineTotal <= 0) continue;

      const share = line.lineTotal / sellingSubtotal;

      const discountedLine = line.lineTotal - netDiscount * share;

      gstAmount += gstOnExclusive(discountedLine, line.gstPercent);

    }

  }



  return {

    sellingSubtotal,

    discount: netDiscount,

    netSelling,

    gstAmount,

    total: netSelling + gstAmount,

  };

}



export function saleAmountsWithGst(

  sellingSubtotal: number,

  discount = 0,

  hasGst = false,

  gstPercent: number = DEFAULT_GST_RATE_PERCENT,

): {

  sellingSubtotal: number;

  discount: number;

  netSelling: number;

  gstAmount: number;

  total: number;

} {

  return saleAmountsFromGstLines(

    [{ lineTotal: sellingSubtotal, gstPercent }],

    discount,

    hasGst,

  );

}



export function gstLabelForRates(rates: number[]): string {

  const unique = [...new Set(rates.map((rate) => normalizeGstPercent(rate)))];

  if (unique.length === 1) return `GST (${unique[0]}%)`;

  return "GST";

}



export function gstLabelForLines(lines: GstLine[]): string {

  return gstLabelForRates(lines.filter((line) => line.lineTotal > 0).map((line) => line.gstPercent));

}


