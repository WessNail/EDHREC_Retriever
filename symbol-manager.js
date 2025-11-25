// Symbol Manager - Local Set Symbol Database
class SymbolManager {
    constructor() {
        this.storageKey = 'edhrec_set_symbols';
        this.database = null;
        this.initialized = false;
    }

	async initialize() {
		if (this.initialized) return true;
		
		// Create simple overlay
		const overlay = document.createElement('div');
		overlay.innerHTML = '🔄 Loading Symbols...';
		overlay.style.cssText = `
			position: fixed;
			top: 20px;
			right: 20px;
			background: rgba(44, 62, 80, 0.9);
			color: white;
			padding: 10px 15px;
			border-radius: 5px;
			z-index: 10001;
			font-family: Arial;
			border: 1px solid #3498db;
		`;
		document.body.appendChild(overlay);
		console.log('🔴 OVERLAY CREATED');
		
		try {
			console.log('🔄 Symbol database initialization starting...');
			
			// Try to load from localStorage first
			this.database = this.loadFromStorage();
			
			// ENHANCED: Ensure conversion tracking exists
			if (this.database && !this.database._conversion) {
				console.log('🔄 Adding conversion tracking to existing database...');
				this.database._conversion = {
					totalSets: Object.keys(this.database.sets).length,
					dataUrlCount: 0,
					urlCount: 0,
					lastConversion: Date.now(),
					autoConvertEnabled: true
				};
				this.updateConversionTracking();
				this.saveToStorage();
			}
			
			// FORCE REFRESH logic remains but now with enhanced criteria
			if (this.database && (this.database.version === '3.0' || this.isDatabaseCorrupted())) {
				console.log('🔄 Detected problematic database, forcing refresh with auto-conversion...');
				await this.forceRefresh();
				return true;
			}
			
			if (!this.database || !this.database.version.includes('dataurl')) {
				console.log('Symbol database not found or not data URL optimized, downloading...');
				await this.downloadBulkSymbols();
			} else {
				console.log(`Loaded optimized symbol database with ${Object.keys(this.database.sets).length} sets`);
				this.verifyDatabase(); // Show current stats
			}
			
			// ADD AFTER DATABASE IS LOADED:
			if (this.database && this.database.version.includes('png')) {
				const svgCount = Object.values(this.database.sets).filter(
					set => set.symbol && set.symbol.includes('image/svg+xml')
				).length;
				
				if (svgCount > 0) {
					console.log(`🔄 Found ${svgCount} SVG symbols, migrating to PNG...`);
					await this.migrateExistingToPNG();
				}
			}

			console.log('🟡 DATABASE LOAD COMPLETE');
			this.initialized = true;
			
	        console.log('🟢 REMOVING OVERLAY');
	        overlay.remove();
	        console.log('✅ OVERLAY REMOVED');
			
		} catch (error) {
			console.error('❌ Symbol database initialization failed:', error);
			this.database = this.createEmptyDatabase();
			this.initialized = true;
			
	        console.log('🟢 REMOVING OVERLAY (ERROR)');
	        overlay.remove();
			return false;
		}
		
		// Check if cache needs invalidation due to format change
		if (this.database.version !== previousVersion && previousVersion) {
			console.log('🔄 Database format changed, clearing caches...');
			this.clearAllCaches();
		}
	}
	
	clearAllCaches() {
		// Clear CardDisplayEngine cache
		if (window.app?.displayEngine?.cardCache) {
			window.app.displayEngine.cardCache.clear();
		}
		
		// Clear any other caches
		localStorage.removeItem('cardCache');
	}

	createEmptyDatabase() {
		return {
			version: '3.3.png', // Track conversion in version
			lastUpdated: Date.now(),
			sets: {},
			default: {
				symbol: '',
				name: 'Unknown Set',
				release_year: ''
			},
			// ADD CONVERSION TRACKING
			_conversion: {
				totalSets: 0,
				dataUrlCount: 0,
				urlCount: 0,
				lastConversion: null,
				autoConvertEnabled: true,
				pngCount: 0 // ADD PNG TRACKING
			}
		};
	}

    // Load database from localStorage
    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (error) {
            console.error('Error loading symbol database from storage:', error);
        }
        return null;
    }

    // Save database to localStorage
    saveToStorage() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.database));
            return true;
        } catch (error) {
            console.error('Error saving symbol database to storage:', error);
            return false;
        }
    }

	async downloadBulkSymbols() {
		console.log('Starting bulk symbol download WITH AUTO-CONVERSION...');
		
		try {
			// Get list of all sets from Scryfall
			const setsResponse = await fetch('https://api.scryfall.com/sets');
			if (!setsResponse.ok) throw new Error('Failed to fetch sets list');
			
			const setsData = await setsResponse.json();
			
			// Filter for relevant EDH sets
			const relevantSets = this.filterRelevantSets(setsData.data);
			
			console.log(`Filtered ${relevantSets.length} relevant sets for download`);
			
			// Initialize database with conversion tracking
			this.database = this.createEmptyDatabase();
			
			let downloadedCount = 0;
			const batchSize = 5; // Reduced for better conversion handling
			
			for (let i = 0; i < relevantSets.length; i += batchSize) {
				const batch = relevantSets.slice(i, i + batchSize);
				
				// USE downloadMissingSet WHICH AUTO-CONVERTS
				const batchPromises = batch.map(set => this.downloadMissingSet(set.code));
				
				const results = await Promise.allSettled(batchPromises);
				
				results.forEach((result, index) => {
					if (result.status === 'fulfilled' && result.value) {
						const setData = result.value;
						this.database.sets[setData.code] = setData;
						downloadedCount++;
						
						// VERIFY PNG CONVERSION
						const isPNG = setData.symbol?.includes('image/png');
						console.log(`✅ Downloaded ${setData.code}: ${isPNG ? 'PNG' : 'SVG'}`);
						
						if (!isPNG) {
							console.warn(`⚠️ ${setData.code} failed PNG conversion`);
						}
						
						console.log(`✅ Downloaded and converted ${setData.code}:`, {
							symbolExists: !!setData.symbol,
							isDataURL: setData.symbol?.startsWith('data:') ? 'YES' : 'NO'
						});
						
					} else if (result.status === 'rejected') {
						console.error(`❌ Failed to download set in batch:`, result.reason);
					}
				});
				
				// Update conversion tracking after each batch
				this.updateConversionTracking();
				
				// Save progress after each batch
				this.saveToStorage();
				
				console.log(`Downloaded ${downloadedCount}/${relevantSets.length} set symbols...`);
				console.log(`Conversion progress: ${this.database._conversion.dataUrlCount} data URLs, ${this.database._conversion.urlCount} URLs`);
				
				// Increased delay to be respectful to the API
				if (i + batchSize < relevantSets.length) {
					await new Promise(resolve => setTimeout(resolve, 1000));
				}
			}
			
			this.database.lastUpdated = Date.now();
			this.saveToStorage();
			
			console.log(`Bulk download completed: ${downloadedCount} sets`);
			console.log(`Final conversion stats:`, this.database._conversion);
			
		} catch (error) {
			console.error('Bulk symbol download failed:', error);
			// Ensure we have at least an empty database
			this.database = this.createEmptyDatabase();
			this.saveToStorage();
		}
	}

    // Filter sets to those relevant for EDH
    filterRelevantSets(allSets) {
        const includedTypes = [
            'core', 'expansion', 'commander', 'masters', 'draft_innovation',
            'funny', 'arsenal', 'duel_deck', 'from_the_vault', 'masterpiece',
            'premium_deck', 'spellbook', 'starter'
        ];
        
        const excludedSets = [
            'arena', 'digital', 'alchemy', 'token', 'memorabilia', 'minigame'
        ];
        
        return allSets.filter(set => {
            // Include by type
            if (includedTypes.includes(set.set_type)) {
                // Exclude specific sets
                if (!excludedSets.some(excluded => set.code.includes(excluded))) {
                    return true;
                }
            }
            return false;
        }).slice(0, 200); // Limit to 200 most relevant sets
    }

	// In symbol-manager.js - REPLACE the downloadSetSymbol method:
	async downloadSetSymbol(set) {
		try {
			console.log(`🔍 Fetching individual set data for: ${set.code}`);
			const response = await fetch(`https://api.scryfall.com/sets/${set.code}`);
			if (!response.ok) throw new Error('Set not found');
			
			const setData = await response.json();
			console.log(`📊 Individual set API response for ${set.code}:`, {
				code: setData.code,
				name: setData.name,
				icon_svg_uri: setData.icon_svg_uri,
				released_at: setData.released_at
			});
			
			// USE INDIVIDUAL SET DATA FOR ALL FIELDS, not the bulk API data
			const symbolData = {
				code: setData.code.toUpperCase(), // Use individual API code
				name: setData.name, // Use individual API name
				release_year: setData.released_at ? new Date(setData.released_at).getFullYear().toString() : '', // Use individual API date
				symbol: setData.icon_svg_uri || '' // Use individual API symbol
			};
			
			console.log(`✅ Processed symbol data for ${set.code}:`, {
				storedCode: symbolData.code,
				symbolExists: !!symbolData.symbol,
				symbolLength: symbolData.symbol?.length,
				symbolUrl: symbolData.symbol
			});
			
			return symbolData;
			
		} catch (error) {
			console.error(`❌ Failed to download symbol for ${set.code}:`, error);
			return null;
		}
	}

	// In symbol-manager.js - MODIFY getSetData method to add detailed diagnostics:
	getSetData(setCode) {
		if (!this.initialized || !this.database) return { ...this.database?.default };
		
		const lookupCode = setCode?.toUpperCase();
		console.log(`🔍 Database lookup: '${setCode}' -> '${lookupCode}', exists: ${!!this.database.sets[lookupCode]}`);
		
		// ADD DETAILED DATABASE INSPECTION
		if (this.database.sets[lookupCode]) {
			const setData = this.database.sets[lookupCode];
			console.log(`📊 Full set data for ${lookupCode}:`, {
				code: setData.code,
				name: setData.name,
				symbol: setData.symbol,
				symbolExists: !!setData.symbol,
				symbolLength: setData.symbol?.length,
				release_year: setData.release_year
			});
			
			// CHECK DATABASE VERSION AND METADATA
			console.log(`📋 Database metadata:`, {
				version: this.database.version,
				lastUpdated: this.database.lastUpdated,
				totalSets: Object.keys(this.database.sets).length
			});
		} else {
			console.log(`❌ Set ${lookupCode} not found in database. Available sets:`, Object.keys(this.database.sets).slice(0, 10));
		}
		
		return this.database.sets[lookupCode] || { ...this.database.default };
	}

    // Check if set exists in database
    hasSet(setCode) {
        return this.initialized && this.database && !!this.database.sets[setCode?.toUpperCase()];
    }

	async downloadMissingSet(setCode) {
		console.log(`🚀 [DOWNLOAD] downloadMissingSet ENTER: "${setCode}"`);
		
		if (!setCode) {
			console.log('❌ [DOWNLOAD] No set code provided');
			return null;
		}
		
		const lookupCode = setCode.toUpperCase();
		console.log(`🔍 [DOWNLOAD] Processing set: "${lookupCode}"`);
		
		try {
			console.log(`🌐 [DOWNLOAD] Fetching from Scryfall API: https://api.scryfall.com/sets/${lookupCode}`);
			const response = await fetch(`https://api.scryfall.com/sets/${lookupCode}`);
			
			console.log(`📡 [DOWNLOAD] API Response status: ${response.status} ${response.statusText}`);
			
			if (!response.ok) {
				console.log(`❌ [DOWNLOAD] API request failed: ${response.status} ${response.statusText}`);
				return null;
			}
			
			const setData = await response.json();
			console.log(`📥 [DOWNLOAD] API Response data:`, {
				code: setData.code,
				name: setData.name,
				hasIconSvgUri: !!setData.icon_svg_uri,
				iconSvgUri: setData.icon_svg_uri ? setData.icon_svg_uri.substring(0, 50) + '...' : 'MISSING'
			});
			
			let symbolUrl = setData.icon_svg_uri || '';
			
			// AUTO-CONVERT TO DATA URL FOR PDF COMPATIBILITY
			if (symbolUrl && symbolUrl.startsWith('http')) {
				try {
					console.log(`🔄 [DOWNLOAD] Auto-converting SVG to data URL for ${lookupCode}`);
					const dataUrl = await this.convertSvgToDataURL(symbolUrl);
					symbolUrl = dataUrl;
					console.log(`✅ [DOWNLOAD] Auto-conversion successful for ${lookupCode}`);
				} catch (conversionError) {
					console.warn(`⚠️ [DOWNLOAD] Auto-conversion failed for ${lookupCode}, keeping original URL:`, conversionError);
					// Keep original URL as fallback - web display will still work
				}
			}
			
			const symbolData = {
				code: setData.code.toUpperCase(),
				name: setData.name,
				release_year: setData.released_at ? new Date(setData.released_at).getFullYear().toString() : '',
				symbol: symbolUrl
			};
			
			console.log(`💾 [DOWNLOAD] Processed symbol data:`, {
				storedCode: symbolData.code,
				symbolExists: !!symbolData.symbol,
				symbolLength: symbolData.symbol?.length,
				isDataURL: symbolData.symbol?.startsWith('data:') ? 'YES' : 'NO'
			});
			
			if (symbolData.symbol) {
				console.log(`💿 [DOWNLOAD] Storing in database: ${symbolData.code}`);
				this.database.sets[symbolData.code] = symbolData;
				
				console.log(`📦 [DOWNLOAD] Saving to localStorage...`);
				const saveResult = this.saveToStorage();
				console.log(`💾 [DOWNLOAD] Save to storage result: ${saveResult}`);
				
				// Immediate verification
				const verifyStored = this.database.sets[symbolData.code];
				console.log(`🔍 [DOWNLOAD] Storage verification:`, {
					inMemory: !!verifyStored,
					symbolInMemory: verifyStored?.symbol ? 'YES' : 'NO',
					isDataURL: verifyStored?.symbol?.startsWith('data:') ? 'YES' : 'NO'
				});
				
				console.log(`✅ [DOWNLOAD] Successfully stored set: ${symbolData.code}`);
			} else {
				console.log(`⚠️ [DOWNLOAD] Set ${symbolData.code} has no symbol URL`);
			}
			
			return symbolData;
			
		} catch (error) {
			console.error(`❌ [DOWNLOAD] Exception in downloadMissingSet:`, error);
			return null;
		}
	}

	// In symbol-manager.js - REPLACE the getSetDataWithDownload method with debug version:

	async getSetDataWithDownload(setCode) {
		console.log(`🎯 [TRACE] getSetDataWithDownload ENTER: "${setCode}"`);
		
		if (!setCode) {
			console.log('❌ [TRACE] No set code provided');
			return this.getSetData(setCode);
		}
		
		const lookupCode = setCode.toUpperCase();
		console.log(`🔍 [TRACE] Normalized lookup code: "${lookupCode}"`);
		
		// Check if we have it locally first
		const hasSet = this.hasSet(lookupCode);
		console.log(`📊 [TRACE] Local check - hasSet("${lookupCode}"): ${hasSet}`);
		
		if (hasSet) {
			const localData = this.getSetData(lookupCode);
			console.log(`✅ [TRACE] Set found locally: ${lookupCode}`, {
				name: localData.name,
				symbolExists: !!localData.symbol,
				symbolLength: localData.symbol?.length,
				symbolUrl: localData.symbol ? localData.symbol.substring(0, 30) + '...' : 'NO_SYMBOL'
			});
			return localData;
		}
		
		console.log(`❌ [TRACE] Set NOT found locally: ${lookupCode}`);
		console.log(`📈 [TRACE] Database stats: ${Object.keys(this.database.sets).length} total sets`);
		console.log(`🔍 [TRACE] First 10 sets:`, Object.keys(this.database.sets).slice(0, 10));
		
		// Check if GTC specifically is in the database keys
		if (lookupCode === 'GTC') {
			console.log(`🔎 [TRACE] GTC search - in keys: ${'GTC' in this.database.sets}`);
			console.log(`🔎 [TRACE] GTC search - keys include: ${Object.keys(this.database.sets).includes('GTC')}`);
		}
		
		// Try to download it on-demand
		console.log(`🚀 [TRACE] Attempting on-demand download for: ${lookupCode}`);
		const downloaded = await this.downloadMissingSet(lookupCode);
		
		if (downloaded) {
			console.log(`✅ [TRACE] Successfully downloaded set: ${lookupCode}`, {
				name: downloaded.name,
				symbolExists: !!downloaded.symbol,
				symbolLength: downloaded.symbol?.length,
				storedInDatabase: !!this.database.sets[downloaded.code]
			});
			
			// Verify it's actually in the database now
			const verifyData = this.database.sets[downloaded.code];
			console.log(`🔍 [TRACE] Post-download verification:`, {
				inDatabase: !!verifyData,
				symbolInDatabase: verifyData?.symbol ? 'YES' : 'NO'
			});
			
			return downloaded;
		} else {
			console.log(`💥 [TRACE] downloadMissingSet returned null/undefined for: ${lookupCode}`);
		}
		
		console.log(`🔄 [TRACE] Using fallback for: ${lookupCode}`);
		const fallback = this.getSetData(lookupCode);
		console.log(`📋 [TRACE] Fallback data:`, {
			name: fallback.name,
			symbolExists: !!fallback.symbol,
			symbolLength: fallback.symbol?.length
		});
		
		return fallback;
	}
	
	// In symbol-manager.js - ADD force refresh method:
	async forceRefresh() {
		console.log('🔄 Forcing symbol database refresh WITH AUTO-CONVERSION...');
		try {
			localStorage.removeItem(this.storageKey);
			this.database = null;
			this.initialized = false;
			
			// RE-INITIALIZE WITH AUTO-CONVERSION
			await this.initialize();
			
			// ADD CONVERSION TRACKING TO NEW DATABASE
			if (this.database && !this.database._conversion) {
				this.database._conversion = {
					totalSets: Object.keys(this.database.sets).length,
					dataUrlCount: 0,
					urlCount: 0,
					lastConversion: Date.now(),
					autoConvertEnabled: true
				};
				
				// Update counts based on actual data
				this.updateConversionTracking();
			}
			
			console.log('✅ Force refresh completed with auto-conversion tracking');
			
		} catch (error) {
			console.error('Failed to force refresh:', error);
		}
	}
	
	updateConversionTracking() {
		if (!this.database || !this.database.sets) return;
		
		const sets = Object.values(this.database.sets);
		this.database._conversion.totalSets = sets.length;
		this.database._conversion.pngCount = sets.filter(set => 
			set.symbol && set.symbol.includes('image/png')
		).length;
		this.database._conversion.dataUrlCount = sets.filter(set => 
			set.symbol && set.symbol.startsWith('data:')
		).length;
		this.database._conversion.lastConversion = Date.now();
	}
	
	verifyDatabase() {
		if (!this.database || !this.database.sets) {
			console.log('❌ Database not initialized');
			return;
		}
		
		const sets = Object.values(this.database.sets);
		const totalSets = sets.length;
		const dataUrlCount = sets.filter(set => 
			set.symbol && set.symbol.startsWith('data:')
		).length;
		const urlCount = sets.filter(set => 
			set.symbol && set.symbol.startsWith('http')
		).length;
		
		console.log(`📊 Enhanced Database Verification:`);
		console.log(`   Total sets: ${totalSets}`);
		console.log(`   Data URL symbols: ${dataUrlCount} (${((dataUrlCount / totalSets) * 100).toFixed(1)}%)`);
		console.log(`   URL symbols: ${urlCount} (${((urlCount / totalSets) * 100).toFixed(1)}%)`);
		console.log(`   Version: ${this.database.version}`);
		
		if (this.database._conversion) {
			console.log(`   Conversion tracking:`, this.database._conversion);
		}
		
		// Show sample of data URL and URL sets
		const dataUrlSamples = sets.filter(set => set.symbol?.startsWith('data:')).slice(0, 3);
		const urlSamples = sets.filter(set => set.symbol?.startsWith('http')).slice(0, 3);
		
		console.log(`   Data URL samples:`, dataUrlSamples.map(s => s.code));
		console.log(`   URL samples:`, urlSamples.map(s => s.code));
		
		return { totalSets, dataUrlCount, urlCount };
	}
	
	isDatabaseCorrupted() {
		if (!this.database || !this.database.sets) return true;
		
		const totalSets = Object.keys(this.database.sets).length;
		const dataUrlCount = Object.values(this.database.sets).filter(set => 
			set.symbol && set.symbol.startsWith('data:')
		).length;
		
		// UPDATE CORRUPTION CRITERIA
		console.log(`🔍 Enhanced database health check:`, {
			totalSets: totalSets,
			dataUrlCount: dataUrlCount,
			dataUrlCoverage: `${((dataUrlCount / totalSets) * 100).toFixed(1)}%`,
			version: this.database.version
		});
		
		// Consider database corrupted if:
		// - Less than 150 sets OR
		// - Less than 80% data URL coverage (for PDF compatibility) OR  
		// - Wrong version (not data URL enabled)
		const isCorrupted = totalSets < 150 || 
						   (dataUrlCount / totalSets) < 0.8 ||
						   !this.database.version.includes('dataurl');
		
		if (isCorrupted) {
			console.log(`❌ Database appears corrupted or not data URL optimized:`, {
				totalSets,
				dataUrlCount,
				coverage: `${((dataUrlCount / totalSets) * 100).toFixed(1)}%`,
				version: this.database.version
			});
		}
		
		return isCorrupted;
	}
	
	// Manual repair command - run this in console to fix the database
	async repairDatabase() {
		console.log('🛠️ Manual database repair initiated...');
		const beforeStats = this.isDatabaseCorrupted();
		console.log('Before repair:', beforeStats);
		
		await this.forceRefresh();
		
		const afterStats = this.isDatabaseCorrupted();
		console.log('After repair:', afterStats);
		
		return { before: beforeStats, after: afterStats };
	}

	// In symbol-manager.js - ADD method to manually fix missing sets:
	async downloadSpecificSets(setCodes) {
		console.log(`🛠️ Manually downloading specific sets:`, setCodes);
		const results = [];
		
		for (const setCode of setCodes) {
			try {
				const result = await this.downloadMissingSet(setCode);
				results.push({ setCode, success: !!result, data: result });
			} catch (error) {
				results.push({ setCode, success: false, error: error.message });
			}
			
			// Small delay to be respectful to API
			await new Promise(resolve => setTimeout(resolve, 200));
		}
		
		console.log(`📊 Manual download results:`, results);
		return results;
	}
	
	/**
	 * Manual conversion of existing database to data URLs
	 * @returns {Promise<Object>} Conversion results
	 */
	async convertDatabaseToDataURLs() {
		console.log('🔄 Starting manual database conversion to data URLs');
		
		if (!this.database || !this.database.sets) {
			console.error('❌ Database not initialized');
			return { converted: 0, errors: 1 };
		}
		
		let convertedCount = 0;
		let errorCount = 0;
		const totalSets = Object.keys(this.database.sets).length;
		
		console.log(`📊 Processing ${totalSets} sets for conversion...`);
		
		for (const [setCode, setData] of Object.entries(this.database.sets)) {
			if (setData.symbol && setData.symbol.startsWith('http') && !setData.symbol.startsWith('data:')) {
				try {
					console.log(`🔄 Converting ${setCode}...`);
					const dataUrl = await this.convertSvgToDataURL(setData.symbol);
					setData.symbol = dataUrl;
					setData._converted = true;
					convertedCount++;
					console.log(`✅ Converted ${setCode} (${convertedCount}/${totalSets})`);
				} catch (error) {
					console.error(`❌ Failed to convert ${setCode}:`, error.message);
					errorCount++;
				}
				
				// Rate limiting to be respectful to Scryfall
				await new Promise(resolve => setTimeout(resolve, 200));
			} else {
				console.log(`⏭️  Skipping ${setCode} - already data URL or no symbol`);
			}
		}
		
		this.database.version = '3.2-dataurl';
		this.saveToStorage();
		
		console.log(`📊 Conversion complete: ${convertedCount} converted, ${errorCount} errors out of ${totalSets} total sets`);
		return { converted: convertedCount, errors: errorCount, total: totalSets };
	}
	

async convertSvgToDataURL(svgUrl) {
    try {
        console.log(`📥 [CONVERSION] Fetching SVG from: ${svgUrl.substring(0, 80)}...`);
        const response = await fetch(svgUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const svgText = await response.text();
        console.log(`📊 [CONVERSION] SVG content length: ${svgText.length} characters`);
        
        // CONVERT TO PNG WITH PHYSICAL REDUCTION (PROVEN WORKING APPROACH)
        const pngDataUrl = await this.convertSvgToPng(svgText, 0.5);
        console.log(`✅ [CONVERSION] Successfully converted SVG to PNG with 0.5x scaling`);
        
        return pngDataUrl;
        
    } catch (error) {
        console.error(`❌ [CONVERSION] Failed to convert SVG to data URL:`, error);
        throw error;
    }
}

	/**
	 * Convert SVG text to PNG data URL with scaling (PROVEN WORKING METHOD)
	 * @param {string} svgText - SVG content
	 * @param {number} scale - Scaling factor
	 * @returns {Promise<string>} PNG data URL
	 */
	async convertSvgToPng(svgText, scale = 0.5) {
		return new Promise((resolve) => { // Change from reject to resolve for fallback
			// Create SVG data URL
			const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));
			
			const img = new Image();
			img.onload = function() {
				try {
					const canvas = document.createElement('canvas');
					const ctx = canvas.getContext('2d');
					
					// Apply physical scaling
					canvas.width = Math.floor(img.naturalWidth * scale);
					canvas.height = Math.floor(img.naturalHeight * scale);
					
					// Draw scaled image
					ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
					
					// Convert to PNG data URL
					const pngDataUrl = canvas.toDataURL('image/png');
					
					// VERIFY PNG CREATION
					if (pngDataUrl.length < 1000) {
						console.warn('⚠️ PNG conversion suspiciously small, falling back to SVG');
						resolve(svgDataUrl); // Fallback to SVG
					} else {
						resolve(pngDataUrl);
					}
					
				} catch (error) {
					console.error('❌ PNG conversion failed, falling back to SVG:', error);
					resolve(svgDataUrl); // Fallback to SVG
				}
			};
			
			img.onerror = function() {
				console.error('❌ Image loading failed, using original SVG');
				resolve(svgDataUrl); // Fallback to SVG
			};
			
			img.src = svgDataUrl;
		});
	}
	

	applySvgScaling(svgText, scaleFactor) {
		try {
			// Parse SVG to apply scaling transformations
			const parser = new DOMParser();
			const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
			const svgElement = svgDoc.documentElement;
			
			// Get original dimensions
			const originalWidth = parseFloat(svgElement.getAttribute('width') || '149');
			const originalHeight = parseFloat(svgElement.getAttribute('height') || '150');
			
			// Apply scaling
			const scaledWidth = originalWidth * scaleFactor;
			const scaledHeight = originalHeight * scaleFactor;
			
			// Update dimensions
			svgElement.setAttribute('width', scaledWidth.toString());
			svgElement.setAttribute('height', scaledHeight.toString());
			
			// Scale viewBox if present
			const viewBox = svgElement.getAttribute('viewBox');
			if (viewBox) {
				const [x, y, width, height] = viewBox.split(' ').map(parseFloat);
				const scaledViewBox = [
					x, 
					y, 
					width * scaleFactor, 
					height * scaleFactor
				].join(' ');
				svgElement.setAttribute('viewBox', scaledViewBox);
			}
			
			// Serialize back to string
			const serializer = new XMLSerializer();
			return serializer.serializeToString(svgDoc);
			
		} catch (error) {
			console.error('SVG scaling failed, using original:', error);
			return svgText; // Fallback to original
		}
	}
	
	// ADD TO SymbolManager class in symbol-manager.js
	async migrateExistingToPNG() {
		console.log('🔄 MIGRATING EXISTING SVG SYMBOLS TO PNG');
		let migratedCount = 0;
		
		for (const [setCode, setData] of Object.entries(this.database.sets)) {
			if (setData.symbol && setData.symbol.includes('image/svg+xml')) {
				console.log(`🔄 Converting ${setCode} from SVG to PNG...`);
				// Re-download will trigger PNG conversion via downloadMissingSet
				await this.downloadMissingSet(setCode);
				migratedCount++;
				
				// Rate limiting
				await new Promise(resolve => setTimeout(resolve, 100));
			}
		}
		
		console.log(`✅ Migrated ${migratedCount} symbols to PNG format`);
		return migratedCount;
	}	

}

// Make it available globally
window.downloadMissingSets = (setCodes) => window.symbolDatabase.downloadSpecificSets(setCodes);

// Make it available globally for manual repair
window.repairSymbolDatabase = () => window.symbolDatabase.repairDatabase();

// Create global instance and initialize
window.symbolDatabase = new SymbolManager();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.symbolDatabase.initialize().then(success => {
            if (success) {
                console.log('Symbol database initialized successfully');
            }
        });
    });
} else {
    window.symbolDatabase.initialize().then(success => {
        if (success) {
            console.log('Symbol database initialized successfully');
        }
    });
}

// Export for use in other modules
window.SymbolManager = SymbolManager;


