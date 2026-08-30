import { createClient } from "@supabase/supabase-js"
import pg from "pg"
import "dotenv/config"

async function setupStorage() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL
    })

    try {
        console.log("1. Creating 'papers' bucket...")
        const { data: bucket, error: bucketError } = await supabase.storage.createBucket("papers", {
            public: false,
            fileSizeLimit: 10485760,
            allowedMimeTypes: ["application/pdf"],
        })

        if (bucketError) {
            if (bucketError.message.includes("already exists") || bucketError.message.includes("duplicate key")) {
                console.log("✅ Bucket 'papers' already exists.")
            } else {
                throw new Error(`Failed to create bucket: ${bucketError.message}`)
            }
        } else {
            console.log("✅ Bucket 'papers' created successfully!")
        }

        console.log("2. Setting up Row Level Security (RLS) policies for storage...")

        const sql = `
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "Students can view papers" ON storage.objects;
      DROP POLICY IF EXISTS "Admins can upload and manage papers" ON storage.objects;

      CREATE POLICY "Students can view papers"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'papers');

      CREATE POLICY "Admins can upload and manage papers"
      ON storage.objects
      FOR ALL
      TO authenticated
      USING (
        bucket_id = 'papers' 
        AND auth.uid() IN (SELECT id::uuid FROM public."User" WHERE role = 'ADMIN')
      )
      WITH CHECK (
        bucket_id = 'papers' 
        AND auth.uid() IN (SELECT id::uuid FROM public."User" WHERE role = 'ADMIN')
      );
    `

        await pool.query(sql)
        console.log("✅ Storage RLS Policies created successfully!")

    } catch (error) {
        console.error("❌ Error setting up storage:", error)
    } finally {
        await pool.end()
    }
}

setupStorage()
