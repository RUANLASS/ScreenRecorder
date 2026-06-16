'use server';

import Mux from '@mux/mux-node'

const tokenId = process.env.MUX_TOKEN_ID;
const tokenSecret = process.env.MUX_TOKEN_SECRET ?? process.env.MUX_SECRET;

if (!tokenId || !tokenSecret) {
    throw new Error('Missing Mux credentials. Set MUX_TOKEN_ID and MUX_TOKEN_SECRET (or MUX_SECRET) in your environment.');
}

const mux = new Mux({
    tokenId,
    tokenSecret,
});

export async function generateUploadUrl() {
    const upload = await mux.video.uploads.create({
      cors_origin: '*', // Or specify your app's origin
      new_asset_settings: {
        playback_policies: ['public'], //-> anyone with the URL can watch
        video_quality: "plus", //basic/premium/plus
        mp4_support: 'standard',
        input: [
            {
                generated_subtitles: [
                    {language_code:'en', name:'English (Auto)'}
                ]
            }
        ]
      },
    });

    return upload;
}

export async function getAssetID(uploadID: string){
    const upload = await mux.video.uploads.retrieve(uploadID);
    if(upload.asset_id){
        // asset_id refers to a Video Asset, retrieve it from the assets resource
        const asset = await mux.video.assets.retrieve(upload.asset_id);
        return {
            playbackId: asset.playback_ids?.[0]?.id,
            status: asset.status,
        };
    }
    return {
        status: 'waiting'
    }
}

export async function listVideos(){
    try{
        const assets = await mux.video.assets.list({
            limit: 25,
        })
        return assets.data;
    }
    catch (e){
        console.error("Error received", e);
        return [];
    }
}

function formatVttTime(timestamp: string){
    return timestamp.split('.')[0];
}

export async function getAssetStatus(playbackID: string){
    try{
        const assets = await mux.video.assets.list({limit:100})
        const asset = assets.data.find(a=> a.playback_ids?.some(p=>p.id === playbackID))
        if (!asset) return {status: 'errored', transcript:[]}
        let transcript: {time: string, text: string} [] = [];
        let transcriptStatus: 'preparing' | 'ready' | 'errored' = 'preparing';
        if (asset.status === 'ready' && asset.tracks){
            const textTrack = asset.tracks.find(t => t.type === 'text' && t.text_type === 'subtitles'
            );
            if (textTrack && textTrack.status === 'ready'){
                transcriptStatus = 'ready'
            }

            if (textTrack){
                const vttUrl = `https://stream.mux.com/${playbackID}/text/${textTrack.id}.vtt`
                const resp = await fetch(vttUrl)
                const vttText = await resp.text();
                const blocks = vttText.split('\n\n')

                transcript = blocks.reduce((acc: {time: string, text: string}[], block) => {
                    const lines = block.split('\n');
                    if (lines.length>=2 && lines[1].includes('-->')){
                        const time = formatVttTime(lines[1].split('-->')[0]);
                        const text = lines.slice(2).join(' ');
                        if (text.trim()) acc.push({time, text});
                    }
                    return acc;
                }, [])
            }
        }

        return {
            status: asset.status,
            transcriptStatus,
            transcript,
        }
    }
    catch (e){
        return {status: 'errored', transcriptStatus: 'errored', transcript: []}
    }
}

/*export async function generateVideoSummary(playbackId: string) {
  try {
    // First, find the asset ID from the playback ID
    const assets = await mux.video.assets.list({ limit: 100 });
    const asset = assets.data.find(a => 
      a.playback_ids?.some(p => p.id === playbackId)
    );

    if (!asset) {
      throw new Error('Asset not found');
    }

    // Import dynamically to avoid issues with module resolution
    const { getSummaryAndTags } = await import('@mux/ai/workflows');

    // Generate summary using Mux AI
    // This uses the auto-generated transcript under the hood
    const result = await getSummaryAndTags(asset.id, {
      tone: 'professional', // Options: 'professional', 'playful', 'neutral'
    });

    return {
      title: result.title,
      summary: result.description,
      tags: result.tags,
    };
  } catch (error) {
    console.error('Error generating summary:', error);
    return null;
  }
}*/