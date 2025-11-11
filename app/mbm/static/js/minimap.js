// Mini map SVG generator for turn-by-turn directions
// Transforms GeoJSON coordinates into small visual representations

/**
 * Transform lat/lng coordinates to SVG coordinate space
 * @param {Array} coordinates - Array of [lng, lat] coordinate pairs
 * @param {number} width - SVG viewbox width
 * @param {number} height - SVG viewbox height
 * @param {number} padding - Padding as percentage (0-1)
 * @param {Array} boundingCoordinates - Optional array to use for calculating bounds (for multi-segment context)
 * @returns {Object} Transformed coordinates and metadata
 */
const transformCoordinates = (coordinates, width = 120, height = 120, padding = 0.15, boundingCoordinates = null) => {
  if (!coordinates || coordinates.length === 0) {
    return { points: [], bounds: null }
  }

  // Use boundingCoordinates if provided, otherwise use the input coordinates
  const coordsForBounds = boundingCoordinates && boundingCoordinates.length > 0 ? boundingCoordinates : coordinates

  // Find bounding box
  let minLng = Infinity, maxLng = -Infinity
  let minLat = Infinity, maxLat = -Infinity

  coordsForBounds.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng)
    maxLng = Math.max(maxLng, lng)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  })

  // Calculate ranges
  const lngRange = maxLng - minLng
  const latRange = maxLat - minLat

  // Add padding to bounding box
  const paddedLngRange = lngRange * (1 + padding * 2)
  const paddedLatRange = latRange * (1 + padding * 2)
  const centerLng = (minLng + maxLng) / 2
  const centerLat = (minLat + maxLat) / 2

  // Use the larger range to maintain aspect ratio
  const maxRange = Math.max(paddedLngRange, paddedLatRange)
  
  // Prevent division by zero for single points or very small ranges
  const effectiveRange = maxRange > 0 ? maxRange : 0.001

  // Transform function
  const transform = ([lng, lat]) => {
    // Normalize to 0-1 range, centered
    const x = ((lng - centerLng) / effectiveRange + 0.5) * width
    // Flip Y axis for SVG (top-left origin) and center
    const y = (0.5 - (lat - centerLat) / effectiveRange) * height
    return [x, y]
  }

  const transformedPoints = coordinates.map(transform)

  return {
    points: transformedPoints,
    bounds: { minLng, maxLng, minLat, maxLat },
    center: transform([centerLng, centerLat])
  }
}

/**
 * Extract coordinates from GeoJSON features
 * @param {Array} features - GeoJSON features
 * @returns {Array} Array of [lng, lat] coordinate pairs
 */
const extractCoordinates = (features) => {
  const coords = []
  
  features.forEach(feature => {
    if (feature.geometry && feature.geometry.coordinates) {
      const geomCoords = feature.geometry.coordinates
      if (feature.geometry.type === 'LineString') {
        coords.push(...geomCoords)
      } else if (feature.geometry.type === 'MultiLineString') {
        geomCoords.forEach(line => coords.push(...line))
      }
    }
  })
  
  return coords
}

/**
 * Generate SVG path data from points
 * @param {Array} points - Array of [x, y] coordinate pairs
 * @returns {string} SVG path d attribute
 */
const generatePathData = (points) => {
  if (points.length === 0) return ''
  
  let pathData = `M ${points[0][0]},${points[0][1]}`
  for (let i = 1; i < points.length; i++) {
    pathData += ` L ${points[i][0]},${points[i][1]}`
  }
  
  return pathData
}

/**
 * Draw an arrow indicator at a point
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} angle - Angle in degrees (0 = north, 90 = east, 180 = south, 270 = west)
 * @param {string} color - Arrow color
 * @returns {string} SVG markup for arrow
 */
const drawArrow = (x, y, angle, color) => {
  // Create a simple arrow pointing in the direction of travel
  const size = 8
  // SVG rotate goes clockwise from east (0° = right)
  // Our heading: 0° = north, 90° = east, 180° = south, 270° = west
  // Arrow is drawn pointing right, so we need to rotate it
  // north (0°) needs -90° rotation to point up
  const rotation = angle - 90
  
  return `
    <g transform="translate(${x}, ${y}) rotate(${rotation})">
      <circle cx="0" cy="0" r="${size}" fill="white" opacity="0.9"/>
      <path d="M -${size * 0.4},-${size * 0.4} L ${size * 0.6},0 L -${size * 0.4},${size * 0.4} Z" 
            fill="${color}" stroke="white" stroke-width="1"/>
    </g>
  `
}

/**
 * Generate complete SVG mini map
 * @param {Object} routeData - Complete route GeoJSON
 * @param {Object} direction - Direction object with featureIndices
 * @param {Object} prevDirection - Previous direction object (for context)
 * @param {string} color - Route line color
 * @param {Function} getLineColor - Function to get color for a route type
 * @param {boolean} isFirst - Whether this is the first direction
 * @returns {string} Complete SVG markup
 */
const generateMiniMapSVG = (routeData, direction, prevDirection, color, getLineColor, isFirst = false) => {
  const width = 120
  const height = 120
  
  // Extract the features for this direction
  const currentFeatures = direction.featureIndices.map(idx => routeData.features[idx])
  const currentCoordinates = extractCoordinates(currentFeatures)
  
  if (currentCoordinates.length === 0) {
    // Return empty SVG if no coordinates
    return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"></svg>`
  }
  
  // Extract features for previous direction if it exists
  let prevCoordinates = []
  let prevColor = '#999'
  
  if (prevDirection && prevDirection.featureIndices) {
    const prevFeatures = prevDirection.featureIndices.map(idx => routeData.features[idx])
    prevCoordinates = extractCoordinates(prevFeatures)
    prevColor = getLineColor(prevDirection.type)
  }
  
  // Combine all coordinates for calculating the bounding box
  const allCoordinates = [...prevCoordinates, ...currentCoordinates]
  
  // Transform coordinates to SVG space using the combined bounding box
  const { points: currentPoints } = transformCoordinates(currentCoordinates, width, height, 0.15, allCoordinates)
  const { points: prevPoints } = transformCoordinates(prevCoordinates, width, height, 0.15, allCoordinates)
  
  // Generate path data for each segment
  const currentPathData = generatePathData(currentPoints)
  const prevPathData = prevPoints.length > 0 ? generatePathData(prevPoints) : ''
  
  // Use the actual heading from the direction data (0 = north, 90 = east, etc.)
  // This comes from the database and represents the real-world direction
  const arrowAngle = direction.heading || 0
  
  // Position arrow at the start of the segment (the turn point)
  const arrowPos = currentPoints[0]
  
  // Find connection points for visual clarity
  const currentStart = currentPoints[0]
  const currentEnd = currentPoints[currentPoints.length - 1]
  
  // Start building SVG
  let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="mini-map-svg">
    <!-- Background -->
    <rect width="${width}" height="${height}" fill="#f8f8f8"/>
    
    <!-- Grid lines for context -->
    <line x1="0" y1="${height/2}" x2="${width}" y2="${height/2}" stroke="#e0e0e0" stroke-width="0.5" opacity="0.5"/>
    <line x1="${width/2}" y1="0" x2="${width/2}" y2="${height}" stroke="#e0e0e0" stroke-width="0.5" opacity="0.5"/>
  `
  
  // Draw previous segment (lighter/grayed)
  if (prevPathData) {
    svg += `
    <!-- Previous segment (context) -->
    <path d="${prevPathData}" 
          stroke="${prevColor}" 
          stroke-width="3" 
          fill="none" 
          stroke-linecap="round" 
          stroke-linejoin="round"
          opacity="0.3"/>
    `
  }
  
  // Draw current segment (highlighted)
  svg += `
    <!-- Current segment (highlighted) -->
    <path d="${currentPathData}" 
          stroke="${color}" 
          stroke-width="5" 
          fill="none" 
          stroke-linecap="round" 
          stroke-linejoin="round"/>
    
    <!-- Start point marker (turn point) - solid colored circle -->
    <circle cx="${currentStart[0]}" cy="${currentStart[1]}" r="5" fill="${color}"/>
    
    <!-- Direction arrow at turn point -->
    ${drawArrow(arrowPos[0], arrowPos[1], arrowAngle, color)}
  `
  
  svg += `</svg>`
  
  return svg
}

export { generateMiniMapSVG }

