import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')

  if (!lat || !lng) {
    return NextResponse.json({ error: 'Missing lat or lng' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Solar API not configured' }, { status: 500 })
  }

  try {
    const params = new URLSearchParams({
      'location.latitude': parseFloat(lat).toFixed(7),
      'location.longitude': parseFloat(lng).toFixed(7),
      requiredQuality: 'LOW', // LOW covers India (BASE quality)
      key: apiKey,
    })

    const res = await fetch(
      `https://solar.googleapis.com/v1/buildingInsights:findClosest?${params}`,
      { next: { revalidate: 86400 } } // cache 24h per address
    )

    if (!res.ok) {
      const err = await res.text()
      // NOT_FOUND means no building data at this location
      if (res.status === 404) {
        return NextResponse.json({ notFound: true }, { status: 200 })
      }
      return NextResponse.json({ error: err }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch solar data' }, { status: 500 })
  }
}