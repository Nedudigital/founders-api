// app/api/founders-apply/route.js

const SHOPIFY_ADMIN_URL = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/graphql.json`;
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;

// ---- CORS HEADERS ----
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',              // tighten later if you want
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Preflight handler
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

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

// Helper to return JSON with CORS
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
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
      return jsonResponse(
        { ok: false, message: 'Missing customer_id or email' },
        400
      );
    }

    const customerGid = `gid://shopify/Customer/${customer_id}`;

    // Get today's date as YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];

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

    // 2) Update customer metafields with your specific values
    const metafieldsMutation = `
      mutation UpdateFoundersMetafields(
        $id: ID!,
        $orderName: String!,
        $applicationDate: String!
      ) {
        customerUpdate(input: {
          id: $id,
          metafields: [
            { namespace: "custom", key: "application_data", type: "single_line_text_field", value: "yes" },
            { namespace: "custom", key: "application_submitted_dates", type: "single_line_text_field", value: $applicationDate },
            { namespace: "custom", key: "priority_founder_member", type: "single_line_text_field", value: "true" },
            { namespace: "custom", key: "founder_status", type: "single_line_text_field", value: "pending" },
            { namespace: "custom", key: "founders_applied", type: "single_line_text_field", value: "true" },
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
      applicationDate: today,
    });

    const mfErrors = mfResp?.data?.customerUpdate?.userErrors || [];
    if (mfErrors.length) {
      console.error('Metafield userErrors:', mfErrors);
      return jsonResponse(
        {
          ok: false,
          message: mfErrors.map((e) => e.message).join(', '),
        },
        500
      );
    }

    return jsonResponse({ ok: true }, 200);
  } catch (err) {
    console.error('API error /founders-apply:', err);
    return jsonResponse(
      { ok: false, message: 'Internal server error' },
      500
    );
  }
}
