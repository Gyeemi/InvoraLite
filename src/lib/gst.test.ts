import { describe, expect, it } from "vitest";

import {

  DEFAULT_GST_RATE_PERCENT,

  gstOnExclusive,

  saleAmountsFromGstLines,

  saleAmountsWithGst,

  sellingPriceWithGst,

  totalWithGst,

} from "./gst";



describe("gstOnExclusive", () => {

  it("adds 5% GST on selling price", () => {

    expect(gstOnExclusive(22_000)).toBeCloseTo(1_100, 2);

    expect(totalWithGst(22_000)).toBeCloseTo(23_100, 2);

  });



  it("supports custom GST rates", () => {

    expect(gstOnExclusive(10_000, 7)).toBeCloseTo(700, 2);

    expect(totalWithGst(10_000, 7)).toBeCloseTo(10_700, 2);

  });



  it("returns zero for non-positive amounts", () => {

    expect(gstOnExclusive(0)).toBe(0);

  });

});



describe("sellingPriceWithGst", () => {

  it("returns selling price + GST = total", () => {

    expect(sellingPriceWithGst(22_000)).toEqual({

      gstPercent: DEFAULT_GST_RATE_PERCENT,

      sellingPrice: 22_000,

      gst: 1_100,

      total: 23_100,

    });

  });

});



describe("saleAmountsWithGst", () => {

  it("applies discount before GST", () => {

    const amounts = saleAmountsWithGst(22_000, 2_000, true);

    expect(amounts.netSelling).toBe(20_000);

    expect(amounts.gstAmount).toBeCloseTo(20_000 * (DEFAULT_GST_RATE_PERCENT / 100), 2);

    expect(amounts.total).toBeCloseTo(21_000, 2);

  });

});



describe("saleAmountsFromGstLines", () => {

  it("allocates discount proportionally across mixed GST rates", () => {

    const amounts = saleAmountsFromGstLines(

      [

        { lineTotal: 10_000, gstPercent: 5 },

        { lineTotal: 10_000, gstPercent: 7 },

      ],

      2_000,

      true,

    );

    expect(amounts.netSelling).toBe(18_000);

    expect(amounts.gstAmount).toBeCloseTo(450 + 630, 2);

    expect(amounts.total).toBeCloseTo(19_080, 2);

  });

});

