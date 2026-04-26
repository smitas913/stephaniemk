import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, email, password, full_name, role } = await req.json();

    if (action === "create-user") {
      // Verify caller is owner or admin
      const authHeader = req.headers.get("Authorization")!;
      const token = authHeader.replace("Bearer ", "");
      const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
      
      if (!caller) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: callerProfile } = await supabaseAdmin
        .from("profiles")
        .select("role, is_active")
        .eq("id", caller.id)
        .single();

      if (!callerProfile || !callerProfile.is_active || !["owner", "admin"].includes(callerProfile.role)) {
        return new Response(JSON.stringify({ error: "Only owners and admins can create users" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Admins cannot create owner accounts
      if (role === "owner" && callerProfile.role !== "owner") {
        return new Response(JSON.stringify({ error: "Only owners can create owner accounts" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create auth user (this triggers handle_new_user which creates a customer profile)
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name || email },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update the profile created by the trigger to the correct role
      const { error: profileError } = await supabaseAdmin.from("profiles").update({
        full_name: full_name || email,
        email: email,
        role: role || "admin",
        is_active: true,
      }).eq("id", newUser.user.id);

      if (profileError) {
        return new Response(JSON.stringify({ error: profileError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "bootstrap-owner") {
      // Only works if NO owner profiles exist yet
      const { count } = await supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "owner");

      if (count && count > 0) {
        return new Response(JSON.stringify({ error: "An owner already exists. Use the app to manage users." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create auth user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name || email },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update profile to owner (trigger creates it as customer)
      const { error: profileError } = await supabaseAdmin.from("profiles").update({
        full_name: full_name || email,
        email: email,
        role: "owner",
        is_active: true,
      }).eq("id", newUser.user.id);

      if (profileError) {
        return new Response(JSON.stringify({ error: profileError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});