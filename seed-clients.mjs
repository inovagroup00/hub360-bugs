import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://gtnnuoyimddhbklrlpje.supabase.co";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0bm51b3lpbWRkaGJrbHJscGplIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjgyMzUwNCwiZXhwIjoyMDYyMzk5NTA0fQ.qDKpghRULKbO-oefEucE34fwASBjLHGscIQ7f9cqMWc";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seedClients() {
  console.log("Starting client seed...");

  // 1. Look up project IDs by slug
  console.log("Looking up projects...");

  const projectSlugs = ["az-ib", "liscan", "nex-solar"];
  const projectMap = {};

  for (const slug of projectSlugs) {
    const { data, error } = await supabase
      .from("projects")
      .select("id, name")
      .eq("slug", slug)
      .single();

    if (error || !data) {
      console.error(`  Project ${slug} not found:`, error?.message);
      continue;
    }
    projectMap[slug] = data;
    console.log(`  Found project ${data.name}: ${data.id}`);
  }

  // 2. Create client auth users and team members
  console.log("Creating client users...");

  const clientUsers = [
    {
      email: "cliente@az-ib.com",
      password: "Hub360@2025",
      name: "Cliente AZ-IB",
      role: "client",
      projectSlug: "az-ib",
    },
    {
      email: "cliente@liscan.com",
      password: "Hub360@2025",
      name: "Cliente Liscan",
      role: "client",
      projectSlug: "liscan",
    },
    {
      email: "cliente@nex-solar.com",
      password: "Hub360@2025",
      name: "Cliente NEX Solar",
      role: "client",
      projectSlug: "nex-solar",
    },
  ];

  for (const clientUser of clientUsers) {
    const project = projectMap[clientUser.projectSlug];
    if (!project) {
      console.error(`  Skipping ${clientUser.email}: project ${clientUser.projectSlug} not found`);
      continue;
    }

    // Check if auth user already exists
    let authUserId;
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((u) => u.email === clientUser.email);

    if (existing) {
      console.log(`  User ${clientUser.email} already exists: ${existing.id}`);
      authUserId = existing.id;
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: clientUser.email,
        password: clientUser.password,
        email_confirm: true,
      });

      if (error) {
        console.error(`  Error creating ${clientUser.email}:`, error.message);
        continue;
      }
      console.log(`  Created auth user ${clientUser.email}: ${data.user.id}`);
      authUserId = data.user.id;
    }

    // Check if team member already exists
    const { data: existingMember } = await supabase
      .from("team_members")
      .select("id")
      .eq("email", clientUser.email)
      .single();

    if (existingMember) {
      // Update existing member with project_id and role
      const { error } = await supabase
        .from("team_members")
        .update({ role: clientUser.role, project_id: project.id })
        .eq("id", existingMember.id);

      if (error) {
        console.error(`  Error updating team member ${clientUser.name}:`, error.message);
      } else {
        console.log(`  Team member ${clientUser.name} already exists, updated: ${existingMember.id}`);
      }
    } else {
      const { data, error } = await supabase
        .from("team_members")
        .insert({
          auth_user_id: authUserId,
          name: clientUser.name,
          email: clientUser.email,
          role: clientUser.role,
          project_id: project.id,
        })
        .select("id")
        .single();

      if (error) {
        console.error(`  Error creating team member ${clientUser.name}:`, error.message);
        continue;
      }
      console.log(`  Created team member ${clientUser.name}: ${data.id} (project: ${project.name})`);
    }
  }

  console.log("\nClient seed complete!");
  console.log("\nClient login credentials:");
  console.log("  cliente@az-ib.com / Hub360@2025");
  console.log("  cliente@liscan.com / Hub360@2025");
  console.log("  cliente@nex-solar.com / Hub360@2025");
}

seedClients().catch(console.error);
