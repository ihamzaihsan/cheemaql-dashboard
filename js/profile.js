import { logout, isAuthenticated } from './auth.js';
import {
    getUserInfo, getUserXP, getUserAudits, getUserFinishedProjects, getSkillDetails,
    getCohortPrograms, getCohortPeople, getGroupActivity, getAuditActivity,
    getPendingAudits, getPersonalAuditCode, ACTIVITY_PAGE_SIZE
} from './query.js';

// Check authentication
if (!isAuthenticated()) {
    window.location.href = 'index.html';
}

// DOM Elements
const userInfoElement = document.getElementById('userInfo');
const logoutBtn = document.getElementById('logoutBtn');
const auditGraph = document.getElementById('auditGraph');

// Event Listeners
logoutBtn.addEventListener('click', () => {
    // Add a small animation before logout
    logoutBtn.classList.add('logging-out');
    setTimeout(() => {
        logout();
    }, 300);
});

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

// Load user data with loading states
const loadUserData = async () => {
    try {
        // Show loading states
        userInfoElement.innerHTML = `
            <div class="loading-skeleton">
                <div class="skeleton-line"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line"></div>
            </div>
        `;

        const userInfoData = await getUserInfo();
        const userData = userInfoData.user[0];
        if (!userData) throw new Error('Your profile is not available');
        const userId = userData.id;
        initCohortExplorer(userData);
        initPersonalAudits(userData);
        
        // Fetch all data in parallel for better performance
        const [xpData, auditData, finishedProjects, skillData] = await Promise.all([
            getUserXP(),
            getUserAudits(),
            getUserFinishedProjects(),
            getSkillDetails(userId)
        ]);



        if (skillData?.user?.transactions) {
            createTechnicalSkillsRadar(skillData.user.transactions);
            createTechnologySkillsRadar(skillData.user.transactions);
        }
        
        // Display data once loaded
        displayUserInfo(userInfoData.user);
        
        if (xpData.transaction && xpData.transaction.length > 0) {
            createXPGraph(xpData.transaction);
            let resizeTimer;
            window.addEventListener('resize', () => {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => createXPGraph(xpData.transaction), 200);
            });
        }
        
        createAuditGraph({
            transaction: auditData.up,
            transaction1: auditData.down
        });

        displayCompletedProjects(finishedProjects);
        
    } catch (error) {
        console.error('GraphQL Error:', error);
        // Show error states
        userInfoElement.innerHTML = `
            <div class="error-message">
                <p>Failed to load user data. Please try again later.</p>
            </div>
        `;
    }
};

// Display user information with enhanced layout
const displayUserInfo = (user) => {
    // Extract user data from the first element in the array
    const userData = user[0];
    
    // Get name components or use fallbacks
    const firstName = userData.firstName || userData.attrs?.firstName || "";
    const lastName = userData.lastName || userData.attrs?.lastName || "";
    const fullName = `${firstName} ${lastName}`.trim() || "Not specified";
    
    // Get location information
    const city = userData.addressCity || userData.attrs?.addressCity || "";
    const country = userData.addressCountry || userData.attrs?.addressCountry || "";
    const location = [city, country].filter(Boolean).join(", ") || "Not specified";
    
    // Get level information
    const level = userData.transactions && userData.transactions.length > 0 ? 
             userData.transactions[0].amount : "N/A";

    const campusName = userData.campus || "Not specified";
    
    userInfoElement.innerHTML = `
        <div class="profile-identity">
            <span class="profile-avatar" aria-hidden="true">${escapeHTML((firstName[0] || userData.login[0] || '') + (lastName[0] || ''))}</span>
            <div><p class="profile-eyebrow">YOUR LEARNING PROFILE</p><h2>${escapeHTML(fullName)}</h2><span>@${escapeHTML(userData.login)} · ${escapeHTML(campusName)} · Level ${escapeHTML(level)}</span></div>
        </div>
        <p><strong>Full Name</strong> ${escapeHTML(fullName)}</p>
        <p><strong>Username</strong> ${escapeHTML(userData.login)}</p>
        <p><strong>Email</strong> ${escapeHTML(userData.email)}</p>
        <p><strong>Campus Location</strong> ${escapeHTML(campusName)}</p>
        <p><strong>Lives in</strong> ${escapeHTML(location)}</p>
        <p><strong>Level</strong> ${escapeHTML(level)}</p>
    `;

    const profileLink = studentLink('Open Reboot01 profile ↗', userData.id, userData.campus);
    profileLink.className = 'profile-platform-link';
    userInfoElement.querySelector('.profile-identity').append(profileLink);
    if (userData.avatarUrl) {
        try {
            const url = new URL(userData.avatarUrl, PLATFORM);
            if (url.protocol === 'https:') {
                const avatar = document.createElement('img');
                avatar.src = url.href;
                avatar.alt = '';
                avatar.referrerPolicy = 'no-referrer';
                avatar.addEventListener('error', () => avatar.remove(), { once: true });
                userInfoElement.querySelector('.profile-avatar').append(avatar);
            }
        } catch { /* Keep the initials when an avatar URL is invalid. */ }
    }

    // Add animation to the user info section
    const userInfoItems = userInfoElement.querySelectorAll('p');
    userInfoItems.forEach((item, index) => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(10px)';
        setTimeout(() => {
            item.style.transition = 'all 0.3s ease';
            item.style.opacity = '1';
            item.style.transform = 'translateY(0)';
        }, 100 * index);
    });
};

// Enhanced XP Graph with better animations and interactivity
const createXPGraph = (transactions) => {
    const svg = d3.select('.xp-progression-svg');
    const tooltip = d3.select('.xp-tooltip');
    
    // Clear previous elements
    svg.selectAll('.hover-line').remove();
    svg.selectAll('.x-axis').remove();
    svg.selectAll('.y-axis').remove();

    // Data processing
    let cumulativeXP = 0;
    const data = transactions.map(t => {
        cumulativeXP += t.amount;
        return {
            date: new Date(t.createdAt),
            xp: cumulativeXP,
            delta: t.amount,
            object: t.object
        };
    });

    // Dimensions
    const width = Math.max(280, svg.node().clientWidth);
    const height = Math.max(200, svg.node().clientHeight);
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    const margin = { top: 20, right: 40, bottom: 60, left: 70 };

    // Function to convert XP to KB
    const xpToKB = (xp) => {
        return (xp / 1000).toFixed(2);
    };

    // Scales
    const xScale = d3.scaleTime()
        .domain(d3.extent(data, d => d.date))
        .range([margin.left, width - margin.right]);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.xp) * 1.1]) // Add 10% padding at the top
        .nice()
        .range([height - margin.bottom, margin.top]);

    // Line generator with smooth curve
    const line = d3.line()
        .x(d => xScale(d.date))
        .y(d => yScale(d.xp))
        .curve(d3.curveCatmullRom.alpha(0.5)); // Smoother curve

    // Area generator
    const area = d3.area()
        .x(d => xScale(d.date))
        .y0(yScale(0))
        .y1(d => yScale(d.xp))
        .curve(d3.curveCatmullRom.alpha(0.5)); // Match the line curve

    // Animated path drawing with improved animation
    svg.select('.xp-path')
        .datum(data)
        .attr('d', area)
        .style('opacity', 0)
        .transition()
        .duration(1000)
        .style('opacity', 1)
        .attrTween('d', function() {
            const interpolate = d3.interpolateArray(
                data.map(d => ({ ...d, xp: 0 })), 
                data
            );
            return t => area(interpolate(t));
        });

    svg.select('.xp-line')
        .datum(data)
        .attr('d', line)
        .style('opacity', 0)
        .style('stroke-dasharray', function() {
            return this.getTotalLength();
        })
        .style('stroke-dashoffset', function() {
            return this.getTotalLength();
        })
        .style('opacity', 1)
        .transition()
        .duration(1500)
        .ease(d3.easeCubicOut)
        .style('stroke-dashoffset', 0);

    // Add grid lines for better readability
    const xGrid = d3.axisBottom(xScale)
        .tickSize(-(height - margin.top - margin.bottom))
        .tickFormat('')
        .ticks(10);
        
    const yGrid = d3.axisLeft(yScale)
        .tickSize(-(width - margin.left - margin.right))
        .tickFormat('')
        .ticks(5);
        
    svg.select('.grid-x')
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(xGrid)
        .style('opacity', 0)
        .transition()
        .duration(500)
        .delay(1000)
        .style('opacity', 0.5);
        
    svg.select('.grid-y')
        .attr('transform', `translate(${margin.left},0)`)
        .call(yGrid)
        .style('opacity', 0)
        .transition()
        .duration(500)
        .delay(1000)
        .style('opacity', 0.5);

    // Interactive points with staggered animation
    svg.select('.data-points').selectAll('*').remove();
    
    const points = svg.select('.data-points')
        .selectAll('.data-point')
        .data(data)
        .enter().append('circle')
        .attr('class', 'data-point')
        .attr('cx', d => xScale(d.date))
        .attr('cy', d => yScale(d.xp))
        .attr('r', 0)
        .attr('fill', 'var(--accent-primary)')
        .style('opacity', 0.8)
        .style('filter', 'drop-shadow(0 2px 3px rgba(99, 102, 241, 0.3))');
        
    points.transition()
        .delay((d, i) => 1000 + i * 50)
        .duration(300)
        .attr('r', 4)
        .style('opacity', 1);

    // Enhanced interactivity with hover line
    const hoverLine = svg.append('line')
        .attr('class', 'hover-line')
        .attr('y1', margin.top)
        .attr('y2', height - margin.bottom)
        .style('opacity', 0);

    // Add interactivity with improved tooltip
    svg.on('mousemove', (event) => {
        const [xCoord] = d3.pointer(event);
        const bisectDate = d3.bisector(d => d.date).left;
        const x0 = xScale.invert(xCoord);
        const i = bisectDate(data, x0, 1);
        const d0 = data[i - 1];
        const d1 = data[i];
        
        if (!d0 || !d1) return;
        
        const d = x0 - d0.date > d1.date - x0 ? d1 : d0;
        
        // Update hover line
        hoverLine
            .attr('x1', xScale(d.date))
            .attr('x2', xScale(d.date))
            .style('opacity', 0.5);
        
        // Highlight the current point
        svg.selectAll('.data-point')
            .attr('r', 4)
            .style('filter', 'drop-shadow(0 2px 3px rgba(99, 102, 241, 0.3))');
            
        svg.selectAll('.data-point')
            .filter(point => point.date.getTime() === d.date.getTime())
            .attr('r', 6)
            .style('filter', 'drop-shadow(0 0 6px rgba(99, 102, 241, 0.6))');
        
        // Convert SVG coordinates to screen coordinates
        const svgNode = svg.node();
        const point = svgNode.createSVGPoint();
        point.x = xScale(d.date);
        point.y = yScale(d.xp);
        const screenCoords = point.matrixTransform(svgNode.getScreenCTM());
        
        // Get container offset
        const container = d3.select('.xp-graph-container').node();
        const containerRect = container.getBoundingClientRect();
        
        // Format date nicely
        const formatDate = d3.timeFormat('%b %d, %Y');
        
        // Position tooltip with enhanced content
        tooltip.style('opacity', 1)
            .html(`
                <div class="tooltip-content">
                    <strong>${formatDate(d.date)}</strong>

                    <div>Activity: <span style="color: #8b5cf6; font-weight: 600;">${escapeHTML(d.object?.name || 'N/A')}</span></div>
                    <div>Total XP: <span style="color: var(--accent-primary); font-weight: 600;">${xpToKB(d.xp)} KB</span></div>
                    <div>Gained: <span style="color: #10b981; font-weight: 600;">+${xpToKB(d.delta)} KB</span></div>
                </div>
            `)
            .style('left', `${screenCoords.x - containerRect.left}px`)
            .style('top', `${screenCoords.y - containerRect.top - 20}px`)
            .style('transform', 'translate(-50%, -100%)');
    }).on('mouseleave', () => {
        tooltip.style('opacity', 0);
        hoverLine.style('opacity', 0);
        
        // Reset all points
        svg.selectAll('.data-point')
            .attr('r', 4)
            .style('filter', 'drop-shadow(0 2px 3px rgba(99, 102, 241, 0.3))');
    });

    // Axes with better formatting
    const xAxis = d3.axisBottom(xScale)
        .ticks(Math.max(2, Math.floor(width / 90)))
        .tickSizeOuter(0)
        .tickFormat(d3.timeFormat('%b %Y'));

    const yAxis = d3.axisLeft(yScale)
        .ticks(5)
        .tickFormat(d => `${d3.format('.2s')(d)} XP`);

    svg.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(xAxis)
        .selectAll('text')
        .style('text-anchor', 'end')
        .attr('dx', '-.8em')
        .attr('dy', '.15em')
        .attr('transform', 'rotate(-45)');

    svg.append('g')
        .attr('class', 'y-axis')
        .attr('transform', `translate(${margin.left},0)`)
        .call(yAxis);
        
    // Add axis labels for better clarity
    svg.append('text')
        .attr('class', 'axis-label')
        .attr('text-anchor', 'middle')
        .attr('x', width / 2)
        .attr('y', height - 10)
        .style('font-size', '12px')
        .style('fill', '#64748b')
        .text('Date');
        
    svg.append('text')
        .attr('class', 'axis-label')
        .attr('text-anchor', 'middle')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2)
        .attr('y', 25)
        .style('font-size', '12px')
        .style('fill', '#64748b')
        .text('Experience Points');
};

// Enhanced Audit Ratio Graph with better animations
const createAuditGraph = ({ transaction: upTransactions, transaction1: downTransactions }) => {
    // Decimal MB conversion (1 MB = 1,000,000 bytes)
    const bytesToMB = (bytes) => (bytes / 1000000).toFixed(2);
    
    const totalUp = upTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalDown = downTransactions.reduce((sum, t) => sum + t.amount, 0);
    
    const ratio = totalDown > 0
        ? (totalUp / totalDown).toFixed(1)
        : totalUp > 0 ? 'N/A' : '0.0';

    const centerX = 200;
    const centerY = 130;
    const radius = 100;
    const innerRadius = 60;
    
    const createDonutPath = (startAngle, endAngle) => {
        if (endAngle <= startAngle) return '';
        // Two arcs are needed for a complete circle: one arc has coincident endpoints.
        if (endAngle - startAngle >= Math.PI * 2 - 1e-10) {
            return `M ${centerX + radius} ${centerY}
                A ${radius} ${radius} 0 1 1 ${centerX - radius} ${centerY}
                A ${radius} ${radius} 0 1 1 ${centerX + radius} ${centerY}
                M ${centerX + innerRadius} ${centerY}
                A ${innerRadius} ${innerRadius} 0 1 0 ${centerX - innerRadius} ${centerY}
                A ${innerRadius} ${innerRadius} 0 1 0 ${centerX + innerRadius} ${centerY} Z`;
        }
        const start = {
            xOuter: centerX + radius * Math.cos(startAngle),
            yOuter: centerY + radius * Math.sin(startAngle),
            xInner: centerX + innerRadius * Math.cos(startAngle),
            yInner: centerY + innerRadius * Math.sin(startAngle)
        };
        
        const end = {
            xOuter: centerX + radius * Math.cos(endAngle),
            yOuter: centerY + radius * Math.sin(endAngle),
            xInner: centerX + innerRadius * Math.cos(endAngle),
            yInner: centerY + innerRadius * Math.sin(endAngle)
        };
        
        const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
        
        return `M ${start.xOuter} ${start.yOuter}
                A ${radius} ${radius} 0 ${largeArc} 1 ${end.xOuter} ${end.yOuter}
                L ${end.xInner} ${end.yInner}
                A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${start.xInner} ${start.yInner}
                Z`;
    };

    // Calculate angles for animation
    const upRatio = totalUp + totalDown > 0 ? totalUp / (totalUp + totalDown) : 0;
    const upAngle = upRatio * Math.PI * 2;

    auditGraph.innerHTML = `
        <svg viewBox="0 0 400 300" width="100%" height="100%">
            <defs>
                <filter id="shadow">
                    <feDropShadow dx="2" dy="2" stdDeviation="2" flood-opacity="0.2"/>
                </filter>
                <linearGradient id="gradient-up" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#4CAF50"/>
                    <stop offset="100%" stop-color="#2E7D32"/>
                </linearGradient>
                <linearGradient id="gradient-down" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#FF5252"/>
                    <stop offset="100%" stop-color="#D32F2F"/>
                </linearGradient>
            </defs>
            
            <!-- Background Circle -->
            <path d="${createDonutPath(0, Math.PI * 2)}" fill="#eee" filter="url(#shadow)"/>
            
            <!-- Done Transactions -->
            <path class="slice" d="${createDonutPath(0, upAngle)}" 
                  fill="url(#gradient-up)" filter="url(#shadow)"/>
            
            <!-- Received Transactions -->
            <path class="slice" d="${totalDown > 0 ? createDonutPath(upAngle, Math.PI * 2) : ''}"
                  fill="url(#gradient-down)" filter="url(#shadow)"/>
            
            <!-- Center Text -->
            <g transform="translate(200, 130)">
                <circle r="50" fill="white" opacity="0.9"/>
                <text text-anchor="middle" dy="-10" font-size="32" font-weight="700" fill="#2E7D32" class="ratio-text">
                    ${ratio}
                </text>
                <text text-anchor="middle" dy="20" font-size="14" fill="#666">
                    Ratio
                </text>
            </g>
            
            <!-- Legend -->
            <g transform="translate(50, 255)">
                <rect width="16" height="16" fill="url(#gradient-up)" rx="3"/>
                <text x="24" y="13" font-size="14">Done: ${bytesToMB(totalUp)} MB</text>
            </g>
            <g transform="translate(230, 255)">
                <rect width="16" height="16" fill="url(#gradient-down)" rx="3"/>
                <text x="24" y="13" font-size="14">Received: ${bytesToMB(totalDown)} MB</text>
            </g>
        </svg>
    `;

    // Add animation to the ratio text
    const ratioText = auditGraph.querySelector('.ratio-text');
    if (ratioText) {
        const finalValue = parseFloat(ratio);
        if (!Number.isFinite(finalValue)) return;
        const duration = 1500;
        const startTime = performance.now();
        
        const animateRatio = (currentTime) => {
            const elapsedTime = currentTime - startTime;
            const progress = Math.min(elapsedTime / duration, 1);
            
            // Easing function for smoother animation
            const easeOutQuad = t => t * (2 - t);
            const easedProgress = easeOutQuad(progress);
            
            const currentValue = (finalValue * easedProgress).toFixed(1);
            ratioText.textContent = currentValue;
            
            if (progress < 1) {
                requestAnimationFrame(animateRatio);
            }
        };
        
        requestAnimationFrame(animateRatio);
    }
};

const displayCompletedProjects = async (projectsData) => {
    try {
        // Extract the projects array based on the actual response structure
        let projects = [];
        if (projectsData?.user && Array.isArray(projectsData.user)) {
            // If the response has a user array, get the first user's projectEx
            projects = projectsData.user[0]?.projectEx || [];
        }

        const tableBody = document.querySelector('.projects-table tbody');
        
        // Clear existing rows
        tableBody.innerHTML = '';
        
        // Format date function
        const formatDate = (dateString) => {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        };
        
        // Create table rows with staggered animation
        projects.forEach((project, index) => {
            const row = document.createElement('tr');
            row.style.opacity = '0';
            row.style.transform = 'translateY(10px)';
            
            row.innerHTML = `
                <td>${escapeHTML(project.object?.name || 'N/A')}</td>
                <td><span class="xp-badge">${(project.amount / 1000).toFixed(2)} KB</span></td>
                <td class="date-cell">${formatDate(project.createdAt)}</td>
                <td>
                    <a href="https://learn.reboot01.com/intra${escapeHTML(project.path)}"
                       target="_blank" 
                       rel="noopener noreferrer">
                        View Project
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px;">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </a>
                </td>
            `;
            
            tableBody.appendChild(row);
            
            // Staggered animation
            setTimeout(() => {
                row.style.transition = 'all 0.3s ease';
                row.style.opacity = '1';
                row.style.transform = 'translateY(0)';
            }, 100 * index);
        });
        
        // Add empty state if no projects
        if (projects.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="empty-state">
                        No completed projects found
                    </td>
                </tr>
            `;
        }
        
    } catch (error) {
        console.error('Error loading completed projects:', error);
        document.querySelector('.projects-table tbody').innerHTML = `
            <tr>
                <td colspan="4" class="error-state">
                    Error loading projects. Please try again later.
                </td>
            </tr>
        `;
    }
};



// Add page load animation
document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('header');
    const graphs = document.querySelectorAll('.graph, .xp-graph-card');
    const projectsContainer = document.querySelector('.completed-projects-container');
    
    // Animate header
    header.style.opacity = '0';
    header.style.transform = 'translateY(-20px)';
    setTimeout(() => {
        header.style.transition = 'all 0.5s ease';
        header.style.opacity = '1';
        header.style.transform = 'translateY(0)';
    }, 100);
    
    // Animate graphs with staggered delay
    graphs.forEach((graph, index) => {
        graph.style.opacity = '0';
        graph.style.transform = 'translateY(20px)';
        setTimeout(() => {
            graph.style.transition = 'all 0.5s ease';
            graph.style.opacity = '1';
            graph.style.transform = 'translateY(0)';
        }, 300 + (index * 150));
    });
    
    // Animate projects container
    if (projectsContainer) {
        projectsContainer.style.opacity = '0';
        projectsContainer.style.transform = 'translateY(20px)';
        setTimeout(() => {
            projectsContainer.style.transition = 'all 0.5s ease';
            projectsContainer.style.opacity = '1';
            projectsContainer.style.transform = 'translateY(0)';
        }, 600);
    }
});

// Radar Chart Creation Functions
const createTechnicalSkillsRadar = (skillsData) => {
    const technicalSkills = [
        'skill_prog','skill_algo', 'skill_sys-admin',
        'skill_front-end','skill_back-end', 'skill_game', 'skill_tcp', 'skill_ai',
    ];  
         
    
    const processedData = technicalSkills.map(skill => {
        const found = skillsData.find(d => d.type === skill);
        return {
            axis: skill.replace('skill_', '').replace('-', ' ').toUpperCase(),
            value: found ? found.amount : 0
        };
    });

    drawRadarChart('#technicalRadar', processedData, 'Technical Skills');
};

const createTechnologySkillsRadar = (skillsData) => {
    const technologySkills = [
        'skill_go', 'skill_js',  'skill_html',
         'skill_css', 'skill_unix','skill_docker', 'skill_sql', 'skill_rust', 'skill_graphql',
    ];

    const processedData = technologySkills.map(skill => {
        const found = skillsData.find(d => d.type === skill);
        return {
            axis: skill.replace('skill_', '').toUpperCase(),
            value: found ? found.amount : 0
        };
    });

    drawRadarChart('#technologyRadar', processedData, 'Technology Skills');
};

const drawRadarChart = (containerSelector, data, title) => {
    const container = d3.select(containerSelector);
    container.selectAll("*").remove();

    // Define aspect ratio
    const viewBoxWidth = 465;
    const viewBoxHeight = 398;
    
    // Create responsive SVG
    const svg = container.append('svg')
        .attr('viewBox', `0 0 ${viewBoxWidth} ${viewBoxHeight}`)
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('role', 'img')
        .attr('aria-label', title)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .append('g')
        .attr('transform', `translate(${viewBoxWidth / 2},${viewBoxHeight / 2})`);

    const innerRadius = Math.min(viewBoxWidth, viewBoxHeight) * 0.4 - 10;

    // Keep the caption outside the SVG so it cannot collide with axis labels.
    container.append('p')
        .attr('class', 'radar-title')
        .text(title);

    // Scales
    const rScale = d3.scaleLinear()
        .domain([0, 100])
        .range([0, innerRadius]);

    // Create axes
    const axes = data.map(d => d.axis);
    const angleSlice = (Math.PI * 2) / axes.length;

    // Draw grid
    const levels = 5;
    const levelFactor = innerRadius / levels;

    for(let i = 0; i <= levels; i++) {
        const radius = levelFactor * i;
        
        svg.append('circle')
            .attr('r', radius)
            .style('fill', 'none')
            .style('stroke', '#94a3b8')
            .style('stroke-width', 0.5);

        svg.append('text')
            .attr('text-anchor', 'middle')
            .attr('y', -radius + 2)
            .text(Math.round(100 * (i/levels )))
            .style('font-size', '10px')
            .style('fill', '#64748b');
    }

    // Create axes lines
    axes.forEach((axis, i) => {
        const angle = angleSlice * i - Math.PI/2;

        // Draw axis line
        svg.append('line')
            .attr('x1', 0)
            .attr('y1', 0)
            .attr('x2', Math.cos(angle) * innerRadius)
            .attr('y2', Math.sin(angle) * innerRadius)
            .style('stroke', '#94a3b8')
            .style('stroke-width', 0.5);

        // Axis Labels - position them better for small screens
        svg.append('text')
            .attr('transform', `translate(${Math.cos(angle) * (innerRadius + 30)},${Math.sin(angle) * (innerRadius + 25)})`)
            .text(axis)
            .attr('text-anchor', 'middle')
            .style('font-size', '10px')
            .style('fill', 'rgb(39, 42, 47)')
            .style('text-shadow', '0 1px 0 #fff');
    });

    // Convert data into coordinates
    const radarPoints = data.map((d, i) => {
        const angle = angleSlice * i - Math.PI/2;
        return [
            Math.cos(angle) * rScale(d.value),
            Math.sin(angle) * rScale(d.value)
        ];
    });

    // Close the shape
    radarPoints.push(radarPoints[0]);

    // Create a line generator
    const line = d3.line()
        .x(d => d[0])
        .y(d => d[1])
        .curve(d3.curveLinearClosed);

    // Draw the shape
    svg.append('path')
        .datum(radarPoints)
        .attr('d', line)
        .style('fill', 'rgba(99, 102, 241, 0.2)')
        .style('stroke', 'var(--accent-primary)')
        .style('stroke-width', 2)
        .style('opacity', 0)
        .transition()
        .duration(500)
        .style('opacity', 1);

    // Add data points
    svg.selectAll('.data-point')
        .data(data)
        .enter()
        .append('circle')
            .attr('r', 4)
            .attr('cx', (d, i) => Math.cos(angleSlice * i - Math.PI/2) * rScale(d.value))
            .attr('cy', (d, i) => Math.sin(angleSlice * i - Math.PI/2) * rScale(d.value))
            .style('fill', 'var(--accent-primary)')
            .style('stroke', '#fff')
            .style('stroke-width', 2)
            .style('opacity', 0)
            .transition()
            .delay((d, i) => i * 50)
            .duration(200)
            .style('opacity', 1);
            
    // Add tooltips to data points for better usability on small screens
    svg.selectAll('.data-point-hover')
        .data(data)
        .enter()
        .append('circle')
            .attr('r', 15)
            .attr('cx', (d, i) => Math.cos(angleSlice * i - Math.PI/2) * rScale(d.value))
            .attr('cy', (d, i) => Math.sin(angleSlice * i - Math.PI/2) * rScale(d.value))
            .style('fill', 'transparent')
            .style('pointer-events', 'all')
            .append('title')
            .text(d => `${d.axis}: ${d.value}`);
};


// Cohort ranking, search filters, and rendering.
function numericValue(value) {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function programName(program) {
    const labels = program.cohorts.map(cohort => cohort.name);
    const cohort = labels.map(label => /^cohort\s*(\d+)(?:$|[\s-])/i.exec(label)).find(Boolean);
    return cohort ? `Cohort${cohort[1]}` : labels[0] || `Module enrolment ${program.id}`;
}

// Students can have multiple enrolments. Rank each person once using their
// strongest visible membership in the chosen scope; never add their XP twice.
function rankPeople(people, eventIds, metric) {
    const scope = new Set(eventIds);
    const students = new Map();
    const metricField = { level: 'level', ratio: 'userAuditRatio', xp: 'xp' }[metric];
    if (!metricField) throw new Error('Unknown ranking metric');
    for (const membership of people) {
        if (!scope.has(membership.eventId)) continue;
        const value = numericValue(metric === 'xp' ? membership.xp?.amount : membership[metricField]);
        const existing = students.get(membership.userId);
        if (!existing) {
            students.set(membership.userId, { ...membership, value, eventIds: [membership.eventId] });
        } else {
            const memberships = [...new Set([...existing.eventIds, membership.eventId])];
            if (value !== null && (existing.value === null || value > existing.value)) {
                students.set(membership.userId, { ...membership, value, eventIds: memberships });
            } else {
                existing.eventIds = memberships;
            }
        }
    }
    const rows = [...students.values()].sort((a, b) => {
        if (a.value === null && b.value !== null) return 1;
        if (b.value === null && a.value !== null) return -1;
        return (b.value ?? 0) - (a.value ?? 0) ||
            (a.userLogin || '').localeCompare(b.userLogin || '') || a.userId - b.userId;
    });
    let rank = 0;
    let previous;
    return rows.map((row, index) => {
        if (row.value !== null && row.value !== previous) rank = index + 1;
        previous = row.value;
        return { ...row, rank: row.value === null ? null : rank };
    });
}

function groupFilter(eventIds, search = '', project = '') {
    const where = {
        eventId: { _in: eventIds }, canceledAt: { _is_null: true },
        object: { type: { _eq: 'project' } }
    };
    // Treat searches literally; '%' and '_' are SQL pattern wildcards.
    const pattern = text => `%${text.replace(/[\\%_]/g, char => `\\${char}`)}%`;
    if (search.trim()) where.members = { accepted: { _eq: true }, userLogin: { _ilike: pattern(search.trim()) } };
    if (project.trim()) where.object.name = { _ilike: pattern(project.trim()) };
    return where;
}

function auditFilter(eventIds, search = '', project = '', status = 'pending') {
    const group = groupFilter(eventIds, '', project);
    const where = { group };
    if (search.trim()) {
        const pattern = `%${search.trim().replace(/[\\%_]/g, char => `\\${char}`)}%`;
        where._or = [
            { auditorLogin: { _ilike: pattern } },
            { group: { members: { accepted: { _eq: true }, userLogin: { _ilike: pattern } } } }
        ];
    }
    if (status === 'pending') {
        where.closureType = { _is_null: true };
        where.closedAt = { _is_null: true };
        where.auditedAt = { _is_null: true };
    } else if (status !== 'all') {
        where.closureType = { _eq: status };
    }
    return where;
}

function auditStatus(audit, now = Date.now()) {
    if (audit.closureType) return audit.closureType;
    if (audit.auditedAt || audit.closedAt) return 'closed';
    const deadline = Date.parse(audit.endAt);
    return Number.isFinite(deadline) && deadline < now ? 'overdue' : 'pending';
}


const PLATFORM = 'https://learn.reboot01.com';
const formatNumber = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat('en', {
    dateStyle: 'medium', timeZone: 'Asia/Bahrain'
});

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}

function date(value) {
    const stamp = Date.parse(value);
    return Number.isFinite(stamp) ? dateFormatter.format(stamp) : 'Not available';
}

function xp(value) {
    const amount = numericValue(value);
    if (amount === null) return 'Not visible';
    return `${formatNumber.format(amount / 1000)} kB`;
}

function studentLink(login, id, campus) {
    if (!login) return element('span', 'Not visible');
    const link = element('a', login);
    link.href = `${PLATFORM}/intra/${encodeURIComponent(campus)}/users/${Number(id)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
}

function projectLink(name, path) {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
        return element('span', name || 'Unnamed project');
    }
    const link = element('a', name || 'Unnamed project');
    link.href = `${PLATFORM}/intra${path}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
}

function appendRow(body, values, className) {
    const row = element('tr', undefined, className);
    for (const value of values) {
        const cell = element('td');
        cell.append(value instanceof Node ? value : document.createTextNode(String(value)));
        row.append(cell);
    }
    body.append(row);
}

function membersList(members, campus, currentId) {
    const list = element('div', undefined, 'cohort-member-list');
    for (const member of members) {
        const link = studentLink(member.userLogin, member.userId, campus);
        if (member.userId === currentId) link.append(' (you)');
        list.append(link);
    }
    if (!members.length) list.textContent = 'No accepted members visible';
    return list;
}

function statusBadge(status) {
    const labels = {
        working: 'Working', audit: 'In audit', finished: 'Finished', setup: 'Setting up',
        pending: 'Pending', overdue: 'Overdue', succeeded: 'Succeeded', failed: 'Failed',
        autoFailed: 'Automatically failed', invalidated: 'Invalidated', expired: 'Expired',
        reassigned: 'Reassigned', canceled: 'Canceled', unused: 'Unused', closed: 'Closed'
    };
    return element('span', labels[status] || 'Unknown', 'cohort-status');
}

async function initCohortExplorer(user) {
    const root = document.getElementById('cohortExplorer');
    if (!root || !user) return;
    root.innerHTML = `
        <div class="cohort-heading">
            <div><p class="cohort-eyebrow">CAMPUS INSIGHTS</p><h2>Cohort explorer</h2>
            <p>Compare progress and discover who is building, reviewing, and finishing projects.</p></div>
            <button type="button" class="cohort-refresh">Refresh data</button>
        </div>
        <p class="cohort-scope-note">All cohorts means all API-visible Module enrolments in your campus.
            Filters group students by enrolment; private membership labels and unavailable values are never guessed.</p>
        <form class="cohort-filters" aria-label="Cohort filters">
            <label>Cohort enrolment<select name="cohort"><option value="all">All cohorts</option></select></label>
            <label>Rank by<select name="metric"><option value="level">Level</option>
                <option value="ratio">Audit ratio</option><option value="xp" disabled>XP (requires full visibility)</option></select></label>
            <label>Minimum level<input name="minLevel" type="number" min="0" step="1" placeholder="Any level"></label>
            <label>Ranking order<select name="order"><option value="desc">Highest first</option>
                <option value="asc">Lowest first</option></select></label>
            <label>Student<input name="student" type="search" maxlength="100" placeholder="Search username"></label>
            <label>Project<input name="project" type="search" maxlength="100" placeholder="Search project" disabled></label>
            <label>Status<select name="status" disabled><option value="all">All statuses</option></select></label>
            <button type="submit">Apply filters</button>
        </form>
        <div class="cohort-tabs" role="tablist" aria-label="Cohort views">
            <button type="button" role="tab" id="cohort-tab-rankings" data-view="rankings" aria-selected="true" aria-controls="cohort-results">Rankings</button>
            <button type="button" role="tab" id="cohort-tab-working" data-view="working" aria-selected="false" aria-controls="cohort-results" tabindex="-1">Working on projects</button>
            <button type="button" role="tab" id="cohort-tab-audits" data-view="audits" aria-selected="false" aria-controls="cohort-results" tabindex="-1">Auditing</button>
            <button type="button" role="tab" id="cohort-tab-finished" data-view="finished" aria-selected="false" aria-controls="cohort-results" tabindex="-1">Finished projects</button>
        </div>
        <p class="cohort-message" role="status" aria-live="polite">Loading cohort enrolments…</p>
        <section id="cohort-results" role="tabpanel" aria-labelledby="cohort-tab-rankings" tabindex="0">
            <p class="cohort-view-note"></p>
            <div class="cohort-table-scroll"><table class="cohort-table"><caption class="cohort-sr-only">Cohort rankings</caption>
                <thead></thead><tbody></tbody></table></div>
            <div class="cohort-pagination"><button type="button" class="cohort-previous" disabled>Previous</button>
                <span class="cohort-page-label"></span><button type="button" class="cohort-next" disabled>Next</button></div>
        </section>`;

    const form = root.querySelector('form');
    const input = name => form.elements.namedItem(name);
    const message = root.querySelector('.cohort-message');
    const body = root.querySelector('tbody');
    const head = root.querySelector('thead');
    const next = root.querySelector('.cohort-next');
    const previous = root.querySelector('.cohort-previous');
    let programs = [];
    let people = [];
    let peopleComplete = true;
    let view = 'rankings';
    let offset = 0;
    let controller;
    let bootstrapController;
    let initializing = false;

    const scope = () => input('cohort').value === 'all' ? programs.map(p => p.id) : [Number(input('cohort').value)];
    const cohortName = ids => ids.map(id => programs.find(p => p.id === id)).filter(Boolean).map(programName).join('; ');
    const setBusy = busy => {
        root.querySelector('#cohort-results').setAttribute('aria-busy', String(busy));
        previous.disabled = true;
        next.disabled = true;
        root.querySelector('.cohort-refresh').disabled = initializing || busy;
    };
    const headers = labels => {
        const row = element('tr');
        labels.forEach(label => {
            const th = element('th', label);
            th.scope = 'col';
            row.append(th);
        });
        head.replaceChildren(row);
    };
    const empty = text => {
        const row = element('tr');
        const cell = element('td', text, 'cohort-empty');
        cell.colSpan = head.querySelectorAll('th').length || 1;
        row.append(cell);
        body.append(row);
    };
    const paginate = (total, count) => {
        previous.disabled = offset === 0;
        next.disabled = offset + ACTIVITY_PAGE_SIZE >= total;
        root.querySelector('.cohort-page-label').textContent = total ?
            `${offset + 1}–${offset + count} of ${total}` : '0 results';
    };

    function configureView() {
        input('metric').disabled = view !== 'rankings';
        input('minLevel').disabled = view !== 'rankings';
        input('order').disabled = view !== 'rankings';
        input('project').disabled = view === 'rankings';
        input('status').disabled = view === 'rankings' || view === 'finished';
        input('status').replaceChildren();
        const statuses = view === 'audits' ? [
            ['pending', 'Pending / overdue'], ['all', 'All visible audits'], ['succeeded', 'Succeeded'],
            ['failed', 'Failed'], ['autoFailed', 'Automatically failed'], ['expired', 'Expired'],
            ['invalidated', 'Invalidated'], ['reassigned', 'Reassigned'], ['canceled', 'Canceled'], ['unused', 'Unused']
        ] : [['all', 'Working + in audit + setup'], ['working', 'Working'], ['audit', 'In audit'], ['setup', 'Setting up']];
        statuses.forEach(([value, label]) => input('status').append(new Option(label, value)));
        root.querySelector('.cohort-view-note').textContent = {
            rankings: 'Level and audit ratio are visible across enrolments. XP may be private. Rankings reflect API-visible students; unavailable scores are unranked.',
            working: 'Accepted team members of API-visible project groups. In audit means the project is being reviewed, not that its members are acting as auditors.',
            audits: 'Actual assigned auditors and project teams. Audit rows are permission-filtered by Reboot01 and may only show audits involving your account. Dates use Asia/Bahrain.',
            finished: 'Finished project groups and accepted members. Completion status is a group workflow state; individual pass results are not inferred. Dates use Asia/Bahrain.'
        }[view];
        root.querySelector('caption').textContent = `Cohort ${view}`;
        root.querySelector('#cohort-results').setAttribute('aria-labelledby', `cohort-tab-${view}`);
    }

    async function render() {
        if (initializing || !programs.length) return;
        if (!form.reportValidity()) return;
        controller?.abort();
        const request = new AbortController();
        controller = request;
        const eventIds = scope();
        setBusy(true);
        message.textContent = 'Loading the selected scope…';
        body.replaceChildren();
        const base = groupFilter(eventIds, view === 'rankings' ? '' : input('student').value,
            view === 'rankings' ? '' : input('project').value);
        try {
            if (view === 'rankings') {
                headers(['Rank', 'Student', 'Cohort enrolment', 'Level', 'Module XP', 'Audit ratio']);
                const ranking = rankPeople(people, eventIds, input('metric').value);
                const search = input('student').value.trim().toLowerCase();
                const minimumLevel = input('minLevel').value === '' ? null : Number(input('minLevel').value);
                const matching = ranking.filter(row => (row.userLogin || '').toLowerCase().includes(search) &&
                    (minimumLevel === null || (numericValue(row.level) !== null && Number(row.level) >= minimumLevel)));
                if (input('order').value === 'asc') {
                    matching.sort((a, b) => {
                        if (a.value === null && b.value !== null) return 1;
                        if (b.value === null && a.value !== null) return -1;
                        return (a.value ?? 0) - (b.value ?? 0) ||
                            (a.userLogin || '').localeCompare(b.userLogin || '');
                    });
                }
                const page = matching.slice(offset, offset + ACTIVITY_PAGE_SIZE);
                page.forEach(row => {
                    const student = studentLink(row.userLogin, row.userId, user.campus);
                    if (row.userId === user.id) student.append(' (you)');
                    appendRow(body, [row.rank ?? '—', student, cohortName(row.eventIds),
                        numericValue(row.level) ?? 'Not visible', xp(row.xp?.amount),
                        numericValue(row.userAuditRatio) === null ? 'Not visible' : formatNumber.format(Number(row.userAuditRatio))],
                    row.userId === user.id ? 'cohort-current-user' : undefined);
                });
                if (!page.length) empty('No students match this search.');
                const coverage = ranking.filter(row => row.value !== null).length;
                message.textContent = `${ranking.length} visible students; ${coverage} have a visible ranking score. ${peopleComplete ? '' : 'Partial roster: the 10,000-enrolment loading limit was reached.'}`;
                const xpOption = input('metric').querySelector('option[value="xp"]');
                const scopedMemberships = people.filter(row => eventIds.includes(row.eventId));
                const xpVisible = peopleComplete && scopedMemberships.length > 0 &&
                    scopedMemberships.every(row => numericValue(row.xp?.amount) !== null);
                xpOption.disabled = !xpVisible;
                xpOption.textContent = xpVisible ? 'Module XP' : 'XP (requires full visibility)';
                paginate(matching.length, page.length);
            } else {
                const isAudit = view === 'audits';
                let where;
                if (isAudit) {
                    headers(['Project', 'Auditor', 'Accepted project members', 'Cohort enrolment', 'Status', 'Deadline / closed']);
                    where = auditFilter(eventIds, input('student').value, input('project').value, input('status').value);
                } else {
                    headers(['Project', 'Captain', 'Accepted members', 'Cohort enrolment', 'Status', 'Last updated']);
                    where = { ...base, status: view === 'finished' ? { _eq: 'finished' } :
                        input('status').value === 'all' ? { _in: ['working', 'audit', 'setup'] } : { _eq: input('status').value } };
                }
                const data = await (isAudit ? getAuditActivity(where, offset, request.signal) : getGroupActivity(where, offset, request.signal));
                if (request.signal.aborted) return;
                // A refreshed dataset may have shrunk while the user was on a later page.
                if (offset && offset >= data.total.aggregate.count) {
                    offset = Math.max(0, Math.ceil(data.total.aggregate.count / ACTIVITY_PAGE_SIZE) - 1) * ACTIVITY_PAGE_SIZE;
                    return render();
                }
                data.rows.forEach(row => {
                    const group = isAudit ? row.group : row;
                    const cells = [projectLink(group.object?.name, group.path)];
                    if (isAudit) cells.push(studentLink(row.auditorLogin, row.auditorId, user.campus));
                    else cells.push(studentLink(group.captainLogin, group.captainId, user.campus));
                    cells.push(membersList(group.members, user.campus, user.id), cohortName([group.eventId]),
                        statusBadge(isAudit ? auditStatus(row) : row.status),
                        date(isAudit ? row.closedAt || row.auditedAt || row.endAt : row.updatedAt));
                    appendRow(body, cells);
                });
                if (!data.rows.length) empty('No API-visible records match these filters. This does not prove there is no activity in the cohort.');
                message.textContent = `${data.total.aggregate.count} API-visible ${isAudit ? 'audits' : 'project groups'} match these filters.`;
                paginate(data.total.aggregate.count, data.rows.length);
            }
        } catch (error) {
            if (request.signal.aborted) return;
            body.replaceChildren();
            empty('This view could not be loaded. Use Refresh data to try again.');
            message.textContent = error.message;
            root.querySelector('.cohort-page-label').textContent = '';
        } finally {
            if (!request.signal.aborted) {
                root.querySelector('#cohort-results').setAttribute('aria-busy', 'false');
                root.querySelector('.cohort-refresh').disabled = false;
            }
        }
    }

    async function bootstrap() {
        controller?.abort();
        bootstrapController?.abort();
        bootstrapController = new AbortController();
        const request = bootstrapController;
        initializing = true;
        setBusy(true);
        body.replaceChildren();
        message.textContent = 'Loading campus enrolments and student rankings…';
        const oldScope = input('cohort').value;
        try {
            programs = await getCohortPrograms(user.campus, request.signal);
            input('cohort').replaceChildren(new Option('All cohorts', 'all'));
            programs.forEach(program => input('cohort').append(new Option(programName(program), String(program.id))));
            if (programs.some(program => String(program.id) === oldScope)) input('cohort').value = oldScope;
            const roster = await getCohortPeople(programs.map(program => program.id), request.signal);
            people = roster.people;
            peopleComplete = roster.complete;
            offset = 0;
            if (!programs.length) message.textContent = 'No API-visible Module enrolments were found for your campus.';
        } catch (error) {
            if (!request.signal.aborted) {
                programs = [];
                people = [];
                message.textContent = `Cohort discovery failed: ${error.message}`;
            }
        } finally {
            if (!request.signal.aborted) {
                initializing = false;
                root.querySelector('.cohort-refresh').disabled = false;
                root.querySelector('#cohort-results').setAttribute('aria-busy', 'false');
                if (programs.length) await render();
            }
        }
    }

    form.addEventListener('submit', event => { event.preventDefault(); offset = 0; render(); });
    ['cohort', 'metric', 'status', 'order'].forEach(name => input(name).addEventListener('change', () => {
        offset = 0;
        if (name === 'cohort' && input('metric').value === 'xp') input('metric').value = 'level';
        render();
    }));
    root.querySelector('.cohort-refresh').addEventListener('click', bootstrap);
    previous.addEventListener('click', () => { offset = Math.max(0, offset - ACTIVITY_PAGE_SIZE); render(); });
    next.addEventListener('click', () => { offset += ACTIVITY_PAGE_SIZE; render(); });
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    function activate(tab) {
        tabs.forEach(item => {
            item.setAttribute('aria-selected', String(item === tab));
            item.tabIndex = item === tab ? 0 : -1;
        });
        view = tab.dataset.view;
        offset = 0;
        configureView();
        render();
    }
    tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => activate(tab));
        tab.addEventListener('keydown', event => {
            let target;
            if (event.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length];
            if (event.key === 'ArrowLeft') target = tabs[(index - 1 + tabs.length) % tabs.length];
            if (event.key === 'Home') target = tabs[0];
            if (event.key === 'End') target = tabs[tabs.length - 1];
            if (target) { event.preventDefault(); target.focus(); activate(target); }
        });
    });
    configureView();
    await bootstrap();
}

function auditCountdown(endAt, now = Date.now()) {
    const deadline = endAt ? new Date(endAt).getTime() : NaN;
    if (!Number.isFinite(deadline)) return 'No deadline provided';
    const seconds = Math.floor((deadline - now) / 1000);
    if (seconds <= 0) return 'Deadline passed · refresh to check assignment';
    const days = Math.floor(seconds / 86400);
    const hours = String(Math.floor(seconds % 86400 / 3600)).padStart(2, '0');
    const minutes = String(Math.floor(seconds % 3600 / 60)).padStart(2, '0');
    return `Expires in ${days}d ${hours}:${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function auditRepository(audit) {
    const captain = audit.group?.captainLogin;
    const project = audit.group?.object?.name;
    // Only construct commands from safe repository identifiers and commit hashes.
    const identifier = /^[a-zA-Z0-9_][a-zA-Z0-9._-]*$/;
    if (!identifier.test(captain || '') || !identifier.test(project || '')) return null;
    const url = `${PLATFORM}/git/${encodeURIComponent(captain)}/${encodeURIComponent(project)}`;
    const pinned = /^[a-f0-9]{40}$/i.test(audit.version || '');
    return {
        url, pinned,
        commands: `git clone ${url}\n${pinned ? `git -C ${project} checkout --detach ${audit.version}` : '# Audited commit unavailable; confirm the version with the captain.'}`
    };
}

function initPersonalAudits(user) {
    const root = document.getElementById('personalAudits');
    const list = document.getElementById('personalAuditList');
    const detail = document.getElementById('personalAuditDetail');
    const message = document.getElementById('personalAuditMessage');
    const refresh = document.getElementById('refreshPersonalAudits');
    let selectedId = null;

    function deadlineBadge(audit) {
        const badge = element('span', auditCountdown(audit.endAt), 'audit-deadline');
        if (audit.endAt) badge.dataset.deadline = audit.endAt;
        return badge;
    }

    function selectAudit(audit) {
        selectedId = audit.id;
        list.querySelectorAll('button').forEach(button => {
            button.setAttribute('aria-pressed', String(Number(button.dataset.auditId) === selectedId));
        });
        detail.replaceChildren();
        detail.append(element('p', 'AUDIT DETAIL & SUBJECT', 'profile-eyebrow'));
        detail.append(element('h3', audit.group.object?.name || 'Unnamed project'));
        const captain = element('p', 'Captain: ');
        captain.append(studentLink(audit.group.captainLogin, audit.group.captainId, user.campus));
        detail.append(captain, deadlineBadge(audit));
        if (audit.endAt && Number.isFinite(new Date(audit.endAt).getTime())) {
            const time = element('time', `Due ${new Date(audit.endAt).toLocaleString()}`, 'audit-due-date');
            time.dateTime = audit.endAt;
            detail.append(time);
        }
        const team = element('p', 'Accepted members: ');
        team.append(document.createTextNode(audit.group.members.map(member => member.userLogin).filter(Boolean).join(', ') || 'Not visible'));
        detail.append(team);

        const codeRow = element('div', undefined, 'audit-code-row');
        const code = element('code');
        code.hidden = true;
        const reveal = element('button', 'Reveal code');
        reveal.type = 'button';
        reveal.setAttribute('aria-expanded', 'false');
        code.id = `personal-audit-code-${audit.id}`;
        reveal.setAttribute('aria-controls', code.id);
        let fetched = false;
        reveal.addEventListener('click', async () => {
            if (fetched) {
                code.hidden = !code.hidden;
                reveal.textContent = code.hidden ? 'Reveal code' : 'Hide code';
                reveal.setAttribute('aria-expanded', String(!code.hidden));
                return;
            }
            reveal.disabled = true;
            reveal.textContent = 'Loading code…';
            try {
                const data = await getPersonalAuditCode(audit.id, user.id);
                if (selectedId !== audit.id || !reveal.isConnected) return;
                const value = data.audit[0]?.private?.code;
                if (!value) throw new Error('Code unavailable for this assignment. Refresh the audit list.');
                code.textContent = value;
                code.hidden = false;
                fetched = true;
                reveal.textContent = 'Hide code';
                reveal.setAttribute('aria-expanded', 'true');
                feedback.textContent = '';
            } catch (error) {
                if (!reveal.isConnected) return;
                feedback.textContent = error.message;
                reveal.textContent = 'Retry reveal';
            } finally { reveal.disabled = false; }
        });
        codeRow.append(element('span', 'Audit code'), reveal, code);
        detail.append(codeRow);

        const links = element('div', undefined, 'audit-detail-links');
        links.append(projectLink('Open project & audit subject ↗', audit.group.path));
        const subject = audit.group.object?.subject;
        if (typeof subject === 'string') {
            try {
                const subjectUrl = new URL(subject, PLATFORM);
                if (subjectUrl.origin === PLATFORM && subjectUrl.pathname.startsWith('/api/content/')) {
                    const link = element('a', 'Read subject ↗');
                    link.href = subjectUrl.href;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    links.append(link);
                }
            } catch { /* The official project page remains available. */ }
        }
        const repository = auditRepository(audit);
        if (repository) {
            detail.append(element('p', repository.pinned ? 'Clone the repository and check out the exact audited commit.' : 'The API did not provide a valid audited commit. Confirm the version with the captain.'));
            detail.append(element('pre', repository.commands, 'audit-commands'));
            const repoLink = element('a', 'Open repository ↗');
            repoLink.href = repository.url;
            repoLink.target = '_blank';
            repoLink.rel = 'noopener noreferrer';
            const copy = element('button', 'Copy commands');
            copy.type = 'button';
            copy.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(repository.commands);
                    feedback.textContent = 'Commands copied.';
                } catch { feedback.textContent = 'Clipboard unavailable. Select and copy the commands above.'; }
            });
            links.append(repoLink, copy);
        } else detail.append(element('p', 'Repository commands are unavailable for this assignment.'));
        detail.append(links);
        const feedback = element('p', '', 'audit-feedback');
        feedback.setAttribute('role', 'status');
        detail.append(feedback, element('p', "Follow the subject's audit instructions and verify the audited version with the captain.", 'audit-reminder'));
    }

    async function load() {
        refresh.disabled = true;
        root.setAttribute('aria-busy', 'true');
        message.textContent = 'Loading assigned audits…';
        try {
            const data = await getPendingAudits(user.id);
            list.replaceChildren();
            detail.replaceChildren();
            const count = data.total.aggregate.count;
            message.textContent = count ? `${count} pending assignment${count === 1 ? '' : 's'}${count > data.rows.length ? ` · showing the first ${data.rows.length}` : ''}. Select one to view details.` : 'You have no pending audit assignments visible to this account.';
            for (const audit of data.rows) {
                const card = element('button', undefined, 'personal-audit-option');
                card.type = 'button';
                card.dataset.auditId = audit.id;
                card.setAttribute('aria-pressed', 'false');
                card.setAttribute('aria-controls', 'personalAuditDetail');
                card.append(element('strong', audit.group.object?.name || 'Unnamed project'));
                card.append(element('span', `Captain · ${audit.group.captainLogin || 'Not visible'}`));
                card.append(deadlineBadge(audit), element('span', 'View audit details →', 'audit-option-action'));
                card.addEventListener('click', () => selectAudit(audit));
                list.append(card);
            }
            const selected = data.rows.find(audit => audit.id === selectedId) || data.rows[0];
            if (selected) selectAudit(selected);
            else { selectedId = null; detail.append(element('p', 'New assigned audits will appear here.')); }
        } catch {
            selectedId = null;
            list.replaceChildren();
            detail.replaceChildren();
            message.textContent = 'Could not load your assigned audits. Use Refresh audits to try again.';
        } finally {
            refresh.disabled = false;
            root.setAttribute('aria-busy', 'false');
        }
    }
    refresh.addEventListener('click', load);
    setInterval(() => {
        if (document.hidden) return;
        root.querySelectorAll('[data-deadline]').forEach(badge => {
            badge.textContent = auditCountdown(badge.dataset.deadline);
        });
    }, 1000);
    load();
}

// Initialize after dashboard helpers are defined.
loadUserData();
