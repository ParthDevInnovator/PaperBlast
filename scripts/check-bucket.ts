import { createClient } from "@supabase/supabase-js"
import "dotenv/config"

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

sb.storage.getBucket("papers").then(r => {
    if (r.error) { console.error("Error:", r.error.message); return }
    console.log("Bucket name:", r.data?.name)
    console.log("File size limit:", r.data?.file_size_limit, "bytes =", ((r.data?.file_size_limit || 0) / 1024 / 1024).toFixed(0), "MB")
    console.log("Public:", r.data?.public)
    process.exit(0)
})
