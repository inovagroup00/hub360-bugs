$SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0bm51b3lpbWRkaGJrbHJscGplIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjgyMzUwNCwiZXhwIjoyMDYyMzk5NTA0fQ.qDKpghRULKbO-oefEucE34fwASBjLHGscIQ7f9cqMWc"
$BASE_URL = "https://gtnnuoyimddhbklrlpje.supabase.co"

$headers = @{
  "Authorization" = "Bearer $SERVICE_KEY"
  "apikey" = $SERVICE_KEY
  "Content-Type" = "application/json"
  "Prefer" = "return=minimal"
}

# Split the SQL into individual statements and run them
$sql = Get-Content "C:\Users\Admin\hub360-bugs\setup-db.sql" -Raw

# Use the Supabase SQL endpoint (pg-meta)
$body = @{
  query = $sql
} | ConvertTo-Json -Depth 3 -Compress

try {
  $r = Invoke-WebRequest -Uri "$BASE_URL/rest/v1/rpc/" -Method POST -Headers $headers -Body $body -UseBasicParsing
  Write-Host "Status: $($r.StatusCode)"
  Write-Host $r.Content
} catch {
  Write-Host "Error with rpc: $($_.Exception.Message)"
  Write-Host "Trying pg-meta endpoint..."

  # Try the pg-meta SQL endpoint
  $metaHeaders = @{
    "Authorization" = "Bearer $SERVICE_KEY"
    "apikey" = $SERVICE_KEY
    "Content-Type" = "application/json"
  }

  $metaBody = @{
    query = $sql
  } | ConvertTo-Json -Depth 3 -Compress

  try {
    $r2 = Invoke-WebRequest -Uri "$BASE_URL/pg/query" -Method POST -Headers $metaHeaders -Body $metaBody -UseBasicParsing
    Write-Host "pg-meta Status: $($r2.StatusCode)"
    Write-Host $r2.Content
  } catch {
    Write-Host "pg-meta Error: $($_.Exception.Message)"
  }
}
