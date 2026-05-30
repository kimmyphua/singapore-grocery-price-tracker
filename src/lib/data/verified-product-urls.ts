export type VerifiedProductUrl = {
  productSlug: string;
  url: string;
  fallbackPromotionText?: string;
  retailerSlug?: string;
};

export const verifiedProductUrls: VerifiedProductUrl[] = [
  {
    productSlug: "magnum-mini-almond-6x55ml",
    url: "https://www.lazada.sg/products/pdp-i301118872-s527230478.html?price=12.12&stock=1",
    fallbackPromotionText: "Any 3 Save 38%"
  },
  {
    productSlug: "magnum-mini-almond-6x55ml",
    url: "https://www.fairprice.com.sg/product/magnum-mini-ice-cream-almond-6-x-60ml-13034330"
  },
  {
    productSlug: "magnum-mini-almond-6x55ml",
    url: "https://coldstorage.com.sg/product/magnum-mini-almond-6s"
  },
  {
    productSlug: "magnum-almond-3x110ml",
    url: "https://www.fairprice.com.sg/product/magnum-ice-cream-almond-3-x-110ml-11875144"
  },
  {
    productSlug: "magnum-almond-3x110ml",
    url: "https://coldstorage.com.sg/product/magnum-almond-3-x-110ml"
  },
  {
    productSlug: "magnum-mini-white-chocolate-6x55ml",
    url: "https://www.lazada.sg/products/pdp-i3476860111-s23012446237.html",
    fallbackPromotionText: "Any 3 Save 38%; Spend $45.00 + free gift"
  },
  {
    productSlug: "magnum-mini-white-chocolate-6x55ml",
    url: "https://coldstorage.com.sg/product/magnum-mini-white-chocolate-6-x-55ml"
  },
  {
    productSlug: "bulla-vanilla-2l",
    url: "https://www.fairprice.com.sg/product/11491431"
  },
  {
    productSlug: "bulla-vanilla-2l",
    url: "https://www.lazada.sg/products/pdp-i3646264233-s24103165302.html?price=12.96&stock=1"
  },
  {
    productSlug: "bulla-vanilla-2l",
    url: "https://coldstorage.com.sg/product/bulla-creamy-classics-vanilla-tub-2l"
  },
  {
    productSlug: "tillamook-ice-cream-1-42l",
    url: "https://www.lazada.sg/products/pdp-i577892355-s1652060339.html?price=16.08&stock=1"
  },
  {
    productSlug: "tillamook-ice-cream-1-42l",
    url: "https://www.fairprice.com.sg/product/tillamook-ice-cream-vanilla-bean-1-42l-13198654"
  },
  {
    productSlug: "tillamook-ice-cream-1-42l",
    url: "https://coldstorage.com.sg/product/tillamook-old-fashioned-vanilla-ice-cream-15l"
  }
];
