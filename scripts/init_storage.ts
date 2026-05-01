
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

/**
 * INSTRUCTIONS:
 * 1. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are in your .env file.
 * 2. Run this script: npx tsx scripts/init_storage.ts
 */

async function initStorage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !serviceKey) {
    console.error("Missing Supabase configuration. Please check your .env file.");
    return;
  }

  const supabase = createClient(url, serviceKey);

  console.log("Checking for 'project-files' bucket...");
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) {
    console.error("Error listing buckets:", listError.message);
    return;
  }

  const exists = buckets.find(b => b.name === "project-files");

  if (!exists) {
    console.log("Creating 'project-files' bucket...");
    const { error: createError } = await supabase.storage.createBucket("project-files", {
      public: true,
      allowedMimeTypes: ["image/*", "application/pdf", "text/plain"],
      fileSizeLimit: 10485760 // 10MB
    });

    if (createError) {
      console.error("Failed to create bucket:", createError.message);
      console.log("\nTIP: If you see a permission error, please ensure you have SUPABASE_SERVICE_ROLE_KEY in your .env");
      console.log("Or manually create the bucket 'project-files' in the Supabase Dashboard (Storage > New Bucket).");
      return;
    }
    console.log("Bucket 'project-files' created successfully.");
  } else {
    console.log("Bucket 'project-files' already exists.");
  }

  console.log("\nNOTE: Ensure you have set up RLS policies for the bucket if you want restricted access.");
  console.log("For now, it's set to 'public: true' for easier debugging.");
}

initStorage();
