// Helper to interact with Google Drive API
// We use the access token from AuthContext

const FOLDER_NAME = 'AIChat';

export async function getOrCreateFolder(accessToken: string): Promise<string> {
  // 1. Search for folder
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // 2. Create if not exists
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  const createData = await createRes.json();
  return createData.id;
}

export async function uploadImageToDrive(accessToken: string, base64Data: string, fileName: string): Promise<string> {
  try {
    const folderId = await getOrCreateFolder(accessToken);
    
    // Convert Base64 to Blob
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });

    // Multipart upload
    const metadata = {
      name: fileName,
      parents: [folderId],
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    });

    const data = await res.json();
    return data.id; // We might not strictly need the ID if we store by filename, but ID is safer. 
    // However, the prompt says "store only filename".
    // So we return the ID but we will primarily rely on the name we generated.
  } catch (e) {
    console.error("Upload failed", e);
    throw e;
  }
}

const IMAGE_CACHE_NAME = 'drive-image-cache';

async function getCachedBlob(fileName: string): Promise<Blob | null> {
  try {
    const cache = await caches.open(IMAGE_CACHE_NAME);
    const resp = await cache.match(fileName);
    return resp ? await resp.blob() : null;
  } catch { return null; }
}

async function putCachedBlob(fileName: string, blob: Blob): Promise<void> {
  try {
    const cache = await caches.open(IMAGE_CACHE_NAME);
    await cache.put(fileName, new Response(blob));
  } catch { /* best-effort */ }
}

export async function getImageUrlByName(accessToken: string, fileName: string): Promise<string | null> {
  try {
    // 1. Check browser cache first
    const cached = await getCachedBlob(fileName);
    if (cached) return URL.createObjectURL(cached);

    // 2. Search Drive for file
    const q = `name = '${fileName}' and trashed = false`;
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const searchData = await searchRes.json();

    if (!searchData.files || searchData.files.length === 0) return null;

    const fileId = searchData.files[0].id;

    // 3. Download file content
    const fileRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    if (!fileRes.ok) {
        console.error("Failed to fetch image content", await fileRes.text());
        return null;
    }

    const blob = await fileRes.blob();

    // 4. Cache for next time
    await putCachedBlob(fileName, blob);

    return URL.createObjectURL(blob);
  } catch (e) {
    console.error("Failed to get image", e);
    return null;
  }
}
