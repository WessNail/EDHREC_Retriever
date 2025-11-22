// Export and Import Functions - CLEAN SINGLE IMPLEMENTATION
class ExportManager {
    constructor() {
        this.pdfjs = window.jspdf;
        this.debug = window.debugSystem || (window.app && window.app.debug);
    }

    async generatePdf(cardData, filename = 'edhrec-list.pdf') {
		
		console.log('PDF Generation: Starting with filter logic');
		
		try {
			// Get cutoff value from UI
			const cutoffInput = document.getElementById('pdfCutoff');
			const cutoffPercent = cutoffInput ? parseFloat(cutoffInput.value) || 0 : 0;
			
			console.log(`PDF Filter: Cutoff set to ${cutoffPercent}%`);
			
			// Apply DOM filtering if cutoff specified
			let restorationData = null;
			if (cutoffPercent > 0) {
				restorationData = this.filterDOMForPDF(cutoffPercent);
			}

			this.showPDFLoading();
				
			const { jsPDF } = this.pdfjs;
			const pdf = new jsPDF('p', 'mm', 'a4');
			
			// PDF COORDINATE SYSTEM
			const pageWidth = 210;
			const pageHeight = 297;
			const margin = 8;
			const cardsPerRow = 4;
			const cardsPerColumn = 6;
			const MAX_PAGES = 100;
			
			const availableWidth = pageWidth - (2 * margin);
			const availableHeight = pageHeight - (2 * margin);
			
			const cardWidth = availableWidth / cardsPerRow;
			const cardHeight = availableHeight / cardsPerColumn;
			const sectionHeaderHeight = 8;

			// Get content structure from filtered DOM
			const cardGrid = document.getElementById('cardGrid');
			if (!cardGrid) throw new Error('Card grid element not found');

			const gridChildren = Array.from(cardGrid.children);

			// GROUP ELEMENTS BY SECTION
			const sections = this.groupElementsBySection(gridChildren);

			console.log(`PDF Layout: Processing ${sections.length} sections from filtered DOM`);

			// LAYOUT ENGINE
			let currentPage = 1;
			let currentY = margin;
			let currentCol = 0;

			for (const section of sections) {
				// CHECK PAGE LIMIT FIRST
				if (currentPage > MAX_PAGES) {
					console.log('PDF Layout: Reached page limit, stopping');
					break;
				}
				
				const { header, cards } = section;
				
				// Filter out any cards that are still hidden (safety check)
				const visibleCards = cards.filter(card => card.style.display !== 'none');
				
				if (visibleCards.length === 0) continue;
				
				// CHECK IF SECTION CAN START ON CURRENT PAGE
				const spaceNeeded = (header ? sectionHeaderHeight : 0) + cardHeight;
				
				if (currentY + spaceNeeded > (pageHeight - margin)) {
					pdf.addPage();
					currentPage++;
					currentY = margin;
					currentCol = 0;
					
					if (currentPage > MAX_PAGES) break;
				}
				
				// PLACE SECTION HEADER
				if (header) {
					this.addPrintSectionHeader(pdf, header.textContent, margin, currentY, availableWidth, sectionHeaderHeight);
					currentY += sectionHeaderHeight;
					currentCol = 0;
				}
				
				// PLACE SECTION CARDS
				for (let i = 0; i < visibleCards.length; i++) {
					if (currentPage > MAX_PAGES) break;
					
					const card = visibleCards[i];
					
					// Check if we need new row
					if (currentCol >= cardsPerRow) {
						currentCol = 0;
						currentY += cardHeight;
					}
					
					// Check if card fits
					if (currentY + cardHeight > (pageHeight - margin)) {
						pdf.addPage();
						currentPage++;
						currentY = margin;
						currentCol = 0;
						if (currentPage > MAX_PAGES) break;
					}
					
					const cardX = margin + (currentCol * cardWidth);
					
					await this.addPrintCardToPDF(pdf, card, cardX, currentY, cardWidth, cardHeight);
					
					currentCol++;
				}
				
				// COMPLETE CURRENT ROW AFTER SECTION
				if (currentCol !== 0 && currentPage <= MAX_PAGES) {
					currentY += cardHeight;
					currentCol = 0;
					
					if (currentY > (pageHeight - margin) && currentPage <= MAX_PAGES) {
						pdf.addPage();
						currentPage++;
						currentY = margin;
						currentCol = 0;
						if (currentPage > MAX_PAGES) break;
					}
				}
			}

			const totalPages = pdf.internal.getNumberOfPages();
			
			// FIX: Delete any extra pages beyond MAX_PAGES
			if (totalPages > MAX_PAGES) {
				for (let i = totalPages; i > MAX_PAGES; i--) {
					pdf.deletePage(i);
				}
			}

			// Now get the final page count after deletion
			const finalPageCount = Math.min(totalPages, MAX_PAGES);

			// Add page numbers only to the pages we kept
			for (let i = 1; i <= finalPageCount; i++) {
				pdf.setPage(i);
				pdf.setFontSize(8);
				pdf.setTextColor(100, 100, 100);
				pdf.text(`${i}`, pageWidth - 10, pageHeight - 5);
			}

			// Download
			pdf.save(filename);
			this.hidePDFLoading();
			
			console.log('PDF Generation: Completed successfully');
			
			// RESTORE DOM regardless of success/failure
			if (restorationData) {
				this.restoreDOMAfterPDF(restorationData);
				console.log('PDF Filter: DOM restoration completed');
			}
			
			return true;
			
		} catch (error) {
			console.error('PDF Generation: Failed with error:', error);
			this.hidePDFLoading();
			
			// CRITICAL: Always restore DOM on error
			if (restorationData) {
				this.restoreDOMAfterPDF(restorationData);
				console.log('PDF Filter: Emergency DOM restoration completed');
			}
			
			throw error;
		}
	}

    async addPrintCardToPDF(pdf, cardElement, x, y, width, height) {
        const cardName = cardElement.querySelector('.card-name');
        const name = cardName ? cardName.textContent : 'Unknown';
        const isDoubleBack = cardElement.classList.contains('double-faced-back');
        const backIndicator = cardElement.querySelector('.back-indicator');
        
        try {
            const canvas = await html2canvas(cardElement, {
                scale: 1.5,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                onclone: function(clonedDoc, element) {
					
					// STEP 1: Back indicator styling
                    const clonedBackIndicator = element.querySelector('.back-indicator');     
                    if (clonedBackIndicator) {
                        clonedBackIndicator.setAttribute('style', '');
                        clonedBackIndicator.style.cssText = `
                            color: white !important;
                            background-color: #444 !important;
                            border: 2px solid #444 !important;
                            font-weight: bold !important;
                            padding: 4px 8px !important;
                            border-radius: 6px !important;
                            font-size: 0.9em !important;
                            text-align: center !important;
                            display: inline-block !important;
                            margin: 3px 0 3px 0 !important;
                            min-width: 80px !important;
							line-height: 1.2 !important;
                        `;
                    }
                    
                    // STEP 2: Apply general white background (excluding back indicators AND their children)
                    const allElements = clonedDoc.querySelectorAll('*');
                    allElements.forEach(el => {
                        // Skip back indicators AND any elements inside back indicators
                        const isInBackIndicator = el.closest('.back-indicator');
                        if (!el.classList.contains('back-indicator') && !isInBackIndicator) {
                            el.style.color = '#000000';
                            el.style.backgroundColor = '#ffffff';
                            el.style.boxShadow = 'none';
                        }
                    });
                    
                    // STEP 3: Apply card frame styling
                    const cardFrames = clonedDoc.querySelectorAll('.card-frame');
                    cardFrames.forEach(frame => {
                        frame.style.border = '1px solid #888888';
                        frame.style.background = '#ffffff';
                    });
					
					// STEP 4: ADD SYMBOL SCALING COMPENSATION FOR PDF (1.4x)
					const symbolElements = element.querySelectorAll('.set-symbol-stats');
					symbolElements.forEach(symbol => {
						symbol.style.transform = 'scale(1.4)'; // Compensation for physical 0.5x reduction
						symbol.style.transformOrigin = 'center center';
					});					
					
                }
            });

            const imgData = canvas.toDataURL('image/png');
            pdf.addImage(imgData, 'PNG', x, y, width, height);
            
            // MEDIUM GREY border around card
            pdf.setDrawColor(136, 136, 136);
            pdf.setLineWidth(0.3);
            pdf.rect(x, y, width, height, 'D');
            
            return true;
            
        } catch (error) {
            console.error('Card render failed:', error);
            
            // Fallback
            pdf.setFillColor(255, 255, 255);
            pdf.setDrawColor(136, 136, 136);
            pdf.setLineWidth(0.3);
            pdf.rect(x, y, width, height, 'FD');
            
            pdf.setTextColor(0, 0, 0);
            pdf.setFontSize(7);
            const text = name.substring(0, 30);
            pdf.text(text, x + 2, y + 8);
            
            return false;
        }
    }

    groupElementsBySection(gridChildren) {
        const sections = [];
        let currentSection = { header: null, cards: [] };
        
        for (const element of gridChildren) {
            if (element.classList.contains('section-header')) {
                // Save previous section if it has content
                if (currentSection.header || currentSection.cards.length > 0) {
                    sections.push(currentSection);
                }
                // Start new section
                currentSection = { header: element, cards: [] };
            } else {
                // Add card to current section
                currentSection.cards.push(element);
            }
        }
        
        // Don't forget the last section
        if (currentSection.header || currentSection.cards.length > 0) {
            sections.push(currentSection);
        }
        
        return sections;
    }

    addPrintSectionHeader(pdf, sectionText, x, y, width, height) {
        // Black text inside the wire frame
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'bold');
        
        const text = sectionText.trim();
        const centerX = x + (width / 2);
        const centerY = y + (height / 2) + 2;
        
        pdf.text(text, centerX, centerY, { align: 'center' });
    }

    downloadTextFile(cardData, filename = 'edhrec-list.txt') {
        try {
            const textContent = this.exportToText(cardData);
            const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            setTimeout(() => URL.revokeObjectURL(url), 100);
            
        } catch (error) {
            console.error('Text download failed:', error);
            alert('Download failed. Please check your browser settings.');
        }
    }

    exportToText(cardData) {
        const lines = [];
        lines.push('EDHREC Card List');
        lines.push(`Generated on: ${new Date().toLocaleDateString()}\n`);
        
        for (const [sectionName, cards] of Object.entries(cardData)) {
            lines.push(`${sectionName} (${cards.length} cards)`);
            lines.push('='.repeat(sectionName.length + 10));
            
            cards.forEach(card => {
                lines.push(`• ${card.name} - ${card.inclusion}`);
            });
            
            lines.push('');
        }
        
        return lines.join('\n');
    }

    showPDFLoading() {
        let loadingOverlay = document.getElementById('pdfLoadingOverlay');
        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.id = 'pdfLoadingOverlay';
            loadingOverlay.innerHTML = `
                <div class="pdf-loading-content">
                    <div class="pdf-spinner"></div>
                    <p>Generating PDF...</p>
                </div>
            `;
            document.body.appendChild(loadingOverlay);
            
            const style = document.createElement('style');
            style.textContent = `
                #pdfLoadingOverlay {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0, 0, 0, 0.7); display: flex;
                    justify-content: center; align-items: center; z-index: 10000;
                    color: white; font-size: 18px;
                }
                .pdf-loading-content {
                    text-align: center; background: #2c3e50; padding: 30px;
                    border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                }
                .pdf-spinner {
                    border: 4px solid #f3f3f3; border-top: 4px solid #3498db;
                    border-radius: 50%; width: 50px; height: 50px;
                    animation: spin 1s linear infinite; margin: 0 auto 20px;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
        loadingOverlay.style.display = 'flex';
    }

    hidePDFLoading() {
        const loadingOverlay = document.getElementById('pdfLoadingOverlay');
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }

    parseCardList(textContent) {
        const lines = textContent.split('\n');
        const cards = [];
        let currentSection = 'Imported Cards';
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('#')) continue;
            
            if (trimmedLine.endsWith(')') && trimmedLine.includes('(')) {
                currentSection = trimmedLine.split('(')[0].trim();
                continue;
            }
            
            let cardName = trimmedLine;
            let inclusion = '';
            
            if (trimmedLine.includes('-')) {
                const parts = trimmedLine.split('-').map(part => part.trim());
                if (parts.length >= 2) {
                    cardName = parts.slice(0, -1).join('-').trim();
                    inclusion = parts[parts.length - 1];
                    if (!inclusion.includes('%')) inclusion = '';
                }
            }
            
            if (/^\d+x\s/.test(cardName)) {
                cardName = cardName.replace(/^\d+x\s/, '');
            }
            
            const bracketMatch = cardName.match(/\[(.*?)\]\s*(.*)/);
            if (bracketMatch) {
                inclusion = bracketMatch[1];
                cardName = bracketMatch[2];
            }
            
            if (cardName) {
                cards.push({ name: cardName, inclusion: inclusion || 'N/A', section: currentSection });
            }
        }
        
        const sections = {};
        cards.forEach(card => {
            if (!sections[card.section]) sections[card.section] = [];
            sections[card.section].push({ name: card.name, inclusion: card.inclusion });
        });
        
        return sections;
    }

    validateCardList(cardData) {
        const errors = [];
        const warnings = [];
        
        if (!cardData || Object.keys(cardData).length === 0) {
            errors.push('No card data found');
        } else {
            let totalCards = 0;
            for (const [section, cards] of Object.entries(cardData)) {
                totalCards += cards.length;
                if (cards.length === 0) warnings.push(`Section "${section}" is empty`);
                cards.forEach((card, index) => {
                    if (!card.name || card.name.trim().length === 0) {
                        errors.push(`Empty card name in ${section} at position ${index + 1}`);
                    }
                    if (card.name && card.name.length > 100) {
                        warnings.push(`Long card name in ${section}: "${card.name.substring(0, 50)}..."`);
                    }
                });
            }
            if (totalCards === 0) errors.push('No valid cards found');
            if (totalCards > 500) warnings.push(`Large list: ${totalCards} cards`);
        }
        
        return { isValid: errors.length === 0, errors, warnings };
    }
	
	// Add this method to the ExportManager class:
	filterCardsByInclusion(cardData, cutoffPercent) {
		const filteredData = {};
		
		for (const [sectionName, cards] of Object.entries(cardData)) {
			// Skip special properties like _deckCount
			if (sectionName.startsWith('_')) {
				filteredData[sectionName] = cards;
				continue;
			}
			
			filteredData[sectionName] = cards.filter(card => {
				// Extract percentage number from inclusion string (e.g., "68%" -> 68)
				const inclusionMatch = card.inclusion?.match(/(\d+(?:\.\d+)?)%/);
				if (!inclusionMatch) return true; // Keep cards without percentage
				
				const inclusionValue = parseFloat(inclusionMatch[1]);
				return inclusionValue >= cutoffPercent;
			});
		}
		
		return filteredData;
	}
	
	/**
	 * Filter DOM elements by inclusion percentage, excluding "New Cards" section
	 * @param {number} cutoffPercent - Minimum inclusion percentage
	 * @returns {Object} - Restoration data for undo
	 */
	filterDOMForPDF(cutoffPercent) {
		const cardGrid = document.getElementById('cardGrid');
		if (!cardGrid) return null;

		const restorationData = {
			hiddenElements: []
		};

		const sections = this.groupElementsBySection(Array.from(cardGrid.children));
		
		sections.forEach(section => {
			const sectionName = section.header?.textContent?.trim() || '';
			
			// ALWAYS show sections containing "Commander" or "New" (for New Cards)
			const isExempt = sectionName.toLowerCase().includes('commander') || 
							 sectionName.toLowerCase().includes('new');
			
			if (isExempt) {
				return; // Skip filtering for this section
			}

			// Filter cards in other sections
			section.cards.forEach(cardElement => {
				const inclusionValue = this.getCardInclusionValue(cardElement);
				
				if (inclusionValue < cutoffPercent) {
					restorationData.hiddenElements.push({
						element: cardElement,
						originalDisplay: cardElement.style.display
					});
					cardElement.style.display = 'none';
				}
			});
		});

		return restorationData;
	}

	/**
	 * Extract inclusion percentage from card DOM element
	 * @param {Element} cardElement - Card frame element
	 * @returns {number} - Inclusion percentage or 0 if not found
	 */
	getCardInclusionValue(cardElement) {
		const inclusionElement = cardElement.querySelector('.inclusion-percentage');
		if (!inclusionElement) return 0;
		
		const text = inclusionElement.textContent.trim();
		const match = text.match(/(\d+(?:\.\d+)?)%/);
		
		return match ? parseFloat(match[1]) : 0;
	}

	/**
	 * Restore DOM to original state after PDF generation
	 * @param {Object} restorationData - Data from filterDOMForPDF
	 */
	restoreDOMAfterPDF(restorationData) {
		if (!restorationData) return;
		
		restorationData.hiddenElements.forEach(item => {
			if (item.element && item.element.style) {
				item.element.style.display = item.originalDisplay || '';
			}
		});
	}
	
	
	
}

window.ExportManager = ExportManager;