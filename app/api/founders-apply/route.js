// app/api/founders-apply/route.js

const SHOPIFY_ADMIN_URL = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/graphql.json`;
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;

// Helper to call Shopify Admin GraphQL
async function callShopify(query, variables) {
  const res = await fetch(SHOPIFY_ADMIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (json.errors) {
    console.error('GraphQL top-level errors:', JSON.stringify(json.errors, null, 2));
  }
  return json;
}

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      customer_id,
      email,
      first_name,
      why_join,
      biggest_concern,
      commitment,
      order_number,
    } = body;

    if (!customer_id || !email) {
      return new Response(
        JSON.stringify({ ok: false, message: 'Missing customer_id or email' }),
        { status: 400 }
      );
    }

    const customerGid = `gid://shopify/Customer/${customer_id}`;

    // 1) Add a customer tag
    const tagsMutation = `
      mutation AddFoundersTag($id: ID!) {
        tagsAdd(id: $id, tags: ["Founders Circle Applied"]) {
          userErrors { field message }
        }
      }
    `;

    const tagResp = await callShopify(tagsMutation, { id: customerGid });
    const tagErrors = tagResp?.data?.tagsAdd?.userErrors || [];
    if (tagErrors.length) {
      console.error('Tag userErrors:', tagErrors);
    }

    // 2) Update customer metafields
    const metafieldsMutation = `
      mutation UpdateFoundersMetafields(
        $id: ID!,
        $orderName: String!
      ) {
        customerUpdate(input: {
          id: $id,
          metafields: [
            { namespace: "custom", key: "application_data", type: "single_line_text_field", value: "yes" },
            { namespace: "custom", key: "application_submitted_dates", type: "single_line_text_field", value: "yes" },
            { namespace: "custom", key: "priority_founder_member", type: "single_line_text_field", value: "yes" },
            { namespace: "custom", key: "founder_status", type: "single_line_text_field", value: "yes" },
            { namespace: "custom", key: "founders_applied", type: "single_line_text_field", value: "yes" },
            { namespace: "custom", key: "last_order_name", type: "single_line_text_field", value: $orderName }
          ]
        }) {
          customer { id }
          userErrors { field message }
        }
      }
    `;

    const mfResp = await callShopify(metafieldsMutation, {
      id: customerGid,
      orderName: order_number || 'Unknown',
    });

    const mfErrors = mfResp?.data?.customerUpdate?.userErrors || [];
    if (mfErrors.length) {
      console.error('Metafield userErrors:', mfErrors);
      return new Response(
        JSON.stringify({
          ok: false,
          message: mfErrors.map((e) => e.message).join(', '),
        }),
        { status: 500 }
      );
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('API error /founders-apply:', err);
    return new Response(
      JSON.stringify({ ok: false, message: 'Internal server error' }),
      { status: 500 }
    );
  }
}
