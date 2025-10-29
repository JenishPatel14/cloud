// functions/api/[[path]].js

// Utility functions
function extractShareIdFromUrl(url) {
  const regex = /(?:ww\.mirrobox\.com|www\.nephobox\.com|terafileshare\.com|freeterabox\.com|teraboxlinke\.com|www\.freeterabox\.com|1024tera\.com|4funbox\.co|www\.4funbox\.com|mirrobox\.com|nephobox\.com|terabox\.app|terabox\.com|www\.terabox\.ap|terabox\.fun|www\.terabox\.com|www\.1024tera\.co|www\.momerybox\.com|teraboxapp\.com|momerybox\.com|tibibox\.com|www\.tibibox\.com|www\.teraboxapp\.com|1024terabox\.com|terasharelink\.com)\/s\/([a-zA-Z0-9_-]+)/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

function getCloudflareHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://taradownloader.com/',
    'Origin': 'https://taradownloader.com',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'x-requested-with': 'XMLHttpRequest'
  };
}

function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return 'Unknown size';
  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
}

function getFileExtension(filename) {
  if (!filename) return 'unknown';
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : 'unknown';
}

async function getFileInfo(shareId) {
  const infoUrl = `https://terabox.hnn.workers.dev/api/get-info-new?shorturl=${shareId}&pwd=`;
  
  const response = await fetch(infoUrl, {
    headers: getCloudflareHeaders()
  });
  
  return await response.json();
}

async function getDownloadLinks(postData) {
  try {
    const [fastResponse, slowResponse] = await Promise.all([
      fetch(`https://terabox.hnn.workers.dev/api/get-downloadp`, {
        method: 'POST',
        headers: { 
          ...getCloudflareHeaders(), 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify(postData)
      }),
      fetch(`https://terabox.hnn.workers.dev/api/get-download`, {
        method: 'POST',
        headers: { 
          ...getCloudflareHeaders(), 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify(postData)
      })
    ]);

    const fastData = await fastResponse.json();
    const slowData = await slowResponse.json();

    return {
      fastLink: fastData.downloadLink || fastData.download_url,
      slowLink: slowData.downloadLink || slowData.download_url
    };
  } catch (error) {
    throw new Error(`Failed to get download links: ${error.message}`);
  }
}

// Main API handler
export async function onRequest(context) {
  const { request, params } = context;
  const path = params.path || '';
  
  // Handle different API routes
  if (request.method === 'POST' && path === 'get-links') {
    return handleGetLinks(request);
  }
  
  if (request.method === 'GET' && path === 'ping') {
    return new Response('OK', { status: 200 });
  }
  
  // 404 for unknown API routes
  return new Response('Not Found', { status: 404 });
}

// Handle the main get-links endpoint
async function handleGetLinks(request) {
  try {
    const { teraboxUrl } = await request.json();
    
    if (!teraboxUrl) {
      return new Response(JSON.stringify({ error: 'TeraBox URL is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Extract share ID
    let shareId = teraboxUrl;
    if (teraboxUrl.startsWith('http')) {
      shareId = extractShareIdFromUrl(teraboxUrl);
      if (!shareId) {
        throw new Error('Invalid TeraBox URL');
      }
    }

    // Get file info
    const fileInfo = await getFileInfo(shareId);
    if (!fileInfo?.ok) throw new Error('Failed to get file information');
    if (!fileInfo.list || fileInfo.list.length === 0) throw new Error('No files found');

    const { shareid, uk, sign, timestamp, list } = fileInfo;
    const file = list[0];
    const postData = { shareid, uk, sign, timestamp, fs_id: file.fs_id };

    // Get download links
    const { fastLink, slowLink } = await getDownloadLinks(postData);

    const options = [
      {
        type: 'fast',
        label: 'Fast Download',
        description: 'Higher speed download',
        downloadLink: fastLink
      },
      {
        type: 'slow', 
        label: 'Slow Download',
        description: 'Basic download option',
        downloadLink: slowLink
      },
      {
        type: 'watch',
        label: 'Watch Online',
        description: 'Terabox Online Video',
        downloadLink: `/terabox-video-player`
      }
    ];

    return new Response(JSON.stringify({
      originalUrl: teraboxUrl,
      fileName: file.filename || 'Unknown filename',
      fileSize: formatFileSize(file.size),
      fileType: getFileExtension(file.filename),
      options
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message,
      details: 'Server error'
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}