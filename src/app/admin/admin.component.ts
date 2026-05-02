import { Component, AfterViewInit, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import * as L from 'leaflet';
import Chart from 'chart.js/auto';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
  iconUrl: 'assets/leaflet/marker-icon.png',
  shadowUrl: 'assets/leaflet/marker-shadow.png'
});

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent implements OnInit, OnDestroy, AfterViewInit {
  constructor(
    private router: Router,
    private http: HttpClient
  ) {}

  activeView: string = 'dashboard';

  centers: any[] = [];
  reports: any[] = [];

  selectedCenter: any = null;
  centerEvacuees: any[] = [];

  totalEvacuees = 0;
  totalCenters = 0;
  totalReports = 0;

  normalCenters = 0;
  nearFullCenters = 0;
  fullCenters = 0;

  searchQuery = '';
  highlightedSearch = '';

  searchSuggestions: any[] = [];
  showSuggestions = false;
  private searchTimeout: any = null;
  private readonly apiBaseUrl = 'http://localhost:3000/api/admin';

  showTerms = false;
  showContact = false;
  showLogoutConfirm = false;

  chart: Chart | null = null;
  map: L.Map | null = null;

  centerSearchQuery: string = '';

  locatorMessage: string = '';
  locatorMessageType: 'success' | 'error' | '' = '';

  centerForm = {
    name: '',
    location: '',
    latitude: '',
    longitude: ''
  };

  ngOnInit(): void {
    this.loadDashboard();
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      if (this.activeView === 'dashboard') {
        this.createMap();
      }
    }, 800);
  }

  ngOnDestroy(): void {
    if (this.chart) {
      this.chart.destroy();
    }

    if (this.map) {
      this.map.remove();
      this.map = null;
    }

    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }
  }

  showDashboard(): void {
    this.activeView = 'dashboard';
    this.loadDashboard();
  }

  loadDashboard(): void {
    this.activeView = 'dashboard';
    this.fetchCenters(true);
    this.fetchReports();
  }

  private updateDashboardCounts(): void {
    this.totalCenters = this.centers.length;

    this.totalEvacuees = this.centers.reduce(
      (sum, c) => sum + (Number(c.totalEvacuees) || 0),
      0
    );

    this.totalReports = this.reports.length;

    this.normalCenters = this.centers.filter(c => {
      const status = (c.status || '').toLowerCase().trim();
      return status === 'normal';
    }).length;

    this.nearFullCenters = this.centers.filter(c => {
      const status = (c.status || '').toLowerCase().trim();
      return status === 'near full';
    }).length;

    this.fullCenters = this.centers.filter(c => {
      const status = (c.status || '').toLowerCase().trim();
      return status === 'full' || status === 'critical';
    }).length;
  }

  private fetchCenters(refreshVisuals: boolean = false): void {
    this.http.get<any[]>(`${this.apiBaseUrl}/centers`)
      .subscribe({
        next: (data) => {
          this.centers = data || [];
          this.updateDashboardCounts();

          if (refreshVisuals) {
            setTimeout(() => {
              this.createChart();

              requestAnimationFrame(() => {
                this.createMap();
              });
            }, 800);
          }
        },
        error: (err) => {
          console.error('Failed to load centers:', err);
          this.centers = [];
          this.updateDashboardCounts();
        }
      });
  }

  fetchReports(): void {
    this.http.get<any[]>(`${this.apiBaseUrl}/reports`)
      .subscribe({
        next: (data) => {
          this.reports = data || [];
          this.updateDashboardCounts();
        },
        error: (err) => {
          console.error('Failed to load reports:', err);
          this.reports = [];
          this.updateDashboardCounts();
        }
      });
  }

  createChart(): void {
    const canvas = document.getElementById('occupancyChart') as HTMLCanvasElement | null;
    if (!canvas) return;

    if (this.chart) {
      this.chart.destroy();
    }

    this.chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: this.centers.map(c => c.name),
        datasets: [
          {
            label: 'Evacuees',
            data: this.centers.map(c => Number(c.totalEvacuees) || 0),
            backgroundColor: '#4cafef',
            borderRadius: 6
          },
          {
            label: 'Capacity',
            data: this.centers.map(c => Number(c.capacity) || 0),
            backgroundColor: '#9ca3af',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top'
          }
        }
      }
    });
  }

  createMap(): void {
    const mapEl = document.getElementById('map') as HTMLElement | null;
    if (!mapEl) return;

    const rect = mapEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      setTimeout(() => this.createMap(), 300);
      return;
    }

    if (this.map) {
      this.map.remove();
      this.map = null;
    }

    this.map = L.map('map', {
      zoomControl: true,
      preferCanvas: true
    }).setView([17.6138, 121.7269], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(this.map);

    this.map.whenReady(() => {
      setTimeout(() => {
        this.map?.invalidateSize(true);
      }, 300);
    });

    const bounds: L.LatLngTuple[] = [];

    const redIcon = L.icon({
      iconUrl: 'assets/leaflet/marker-icon-red.png',
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -35]
    });

    this.centers.forEach(c => {
      if (c.latitude == null || c.longitude == null) return;

      const lat = Number(c.latitude);
      const lng = Number(c.longitude);

      if (Number.isNaN(lat) || Number.isNaN(lng)) return;

      const latLng: L.LatLngTuple = [lat, lng];
      bounds.push(latLng);

      L.marker(latLng, { icon: redIcon })
        .addTo(this.map!)
        .bindPopup(`
          <b>${c.name}</b><br>
          ${c.location || ''}<br>
          Latitude: ${lat}<br>
          Longitude: ${lng}<br>
          Evacuees: ${c.totalEvacuees}<br>
          Capacity: ${c.capacity}<br>
          Status: ${c.status}
        `);
    });

    setTimeout(() => {
      if (!this.map) return;

      this.map.invalidateSize(true);

      if (bounds.length > 0) {
        this.map.fitBounds(bounds, {
          padding: [40, 40],
          maxZoom: 15
        });
      }
    }, 500);

    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize(true);
      }
    }, 1000);
  }

  findCenter(): void {
    const query = this.centerSearchQuery.trim().toLowerCase();

    if (!query) {
      this.locatorMessage = 'Please enter a center name.';
      this.locatorMessageType = 'error';
      return;
    }

    const foundCenter = this.centers.find((c: any) =>
      String(c.name || '').toLowerCase().includes(query)
    );

    if (!foundCenter) {
      this.locatorMessage = 'Center not found.';
      this.locatorMessageType = 'error';
      return;
    }

    this.centerForm = {
      name: foundCenter.name || '',
      location: foundCenter.location || '',
      latitude: String(foundCenter.latitude || ''),
      longitude: String(foundCenter.longitude || '')
    };

    this.locatorMessage = 'Center found!';
    this.locatorMessageType = 'success';

    const lat = Number(foundCenter.latitude);
    const lng = Number(foundCenter.longitude);

    if (this.map && !Number.isNaN(lat) && !Number.isNaN(lng)) {
      setTimeout(() => {
        this.map?.invalidateSize(true);
        this.map?.flyTo([lat, lng], 17, {
          animate: true,
          duration: 1.2
        });
      }, 200);
    }
  }

  loadEvacuationCenters(): void {
    this.highlightedSearch = '';
    this.activeView = 'centers';
    this.fetchCenters(false);
  }

  loadReports(): void {
    this.activeView = 'reports';
    this.fetchReports();
  }

  viewDetails(center: any): void {
    this.selectedCenter = center;

    this.http.get<any[]>(
      `${this.apiBaseUrl}/centers/${encodeURIComponent(center.name)}`
    ).subscribe({
      next: (data) => {
        const evacuees = data || [];
        this.centerEvacuees = this.sortEvacuees(evacuees);
        this.activeView = 'centerDetails';
      },
      error: (err) => {
        console.error('Failed to load center details:', err);
        this.centerEvacuees = [];
        this.activeView = 'centerDetails';
      }
    });
  }

  backToCenters(): void {
    this.highlightedSearch = '';
    this.activeView = 'centers';
  }

  onSearchInput(): void {
    const query = this.searchQuery.trim();

    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }

    if (!query) {
      this.searchSuggestions = [];
      this.showSuggestions = false;
      return;
    }

    this.searchTimeout = setTimeout(() => {
      this.http.get<any[]>(
        `${this.apiBaseUrl}/search-evacuee?q=${encodeURIComponent(query)}`
      ).subscribe({
        next: (res) => {
          this.searchSuggestions = res || [];
          this.showSuggestions = true;
        },
        error: (err) => {
          console.error('Suggestion search failed:', err);
          this.searchSuggestions = [];
          this.showSuggestions = false;
        }
      });
    }, 250);
  }

  onSearchFocus(): void {
    if (this.searchQuery.trim()) {
      this.showSuggestions = this.searchSuggestions.length > 0;
      if (!this.searchSuggestions.length) {
        this.onSearchInput();
      }
    }
  }

  hideSuggestions(): void {
    setTimeout(() => {
      this.showSuggestions = false;
    }, 200);
  }

  selectSuggestion(evacuee: any): void {
    const fullName = [
      evacuee.firstname || '',
      evacuee.middlename || '',
      evacuee.lastname || ''
    ]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    this.searchQuery = fullName;
    this.highlightedSearch = fullName.toLowerCase();
    this.showSuggestions = false;
    this.searchSuggestions = [];

    const matchedCenter = this.centers.find(
      c => (c.name || '').trim().toLowerCase() === (evacuee.evacuation_location || '').trim().toLowerCase()
    );

    if (matchedCenter) {
      this.viewDetails(matchedCenter);
      return;
    }

    this.http.get<any[]>(`${this.apiBaseUrl}/centers`).subscribe({
      next: (centers) => {
        this.centers = centers || [];
        this.updateDashboardCounts();

        const center = this.centers.find(
          c => (c.name || '').trim().toLowerCase() === (evacuee.evacuation_location || '').trim().toLowerCase()
        );

        if (center) {
          this.viewDetails(center);
        } else {
          alert('Assigned evacuation center not found.');
        }
      },
      error: (err) => {
        console.error('Failed to reload centers:', err);
        alert('Failed to open evacuee center details.');
      }
    });
  }

  searchEvacuee(): void {
    const query = this.searchQuery.trim();

    if (!query) {
      this.highlightedSearch = '';
      this.searchSuggestions = [];
      this.showSuggestions = false;
      return;
    }

    this.http.get<any[]>(
      `${this.apiBaseUrl}/search-evacuee?q=${encodeURIComponent(query)}`
    ).subscribe({
      next: (res) => {
        this.searchSuggestions = res || [];
        this.showSuggestions = false;

        if (res && res.length > 0) {
          const matchedEvacuee = res[0];
          this.highlightedSearch = query.toLowerCase();

          const center = this.centers.find(
            c => (c.name || '').trim().toLowerCase() === (matchedEvacuee.evacuation_location || '').trim().toLowerCase()
          );

          if (center) {
            this.viewDetails(center);
            return;
          }

          this.http.get<any[]>(`${this.apiBaseUrl}/centers`).subscribe({
            next: (centers) => {
              this.centers = centers || [];
              this.updateDashboardCounts();

              const loadedCenter = this.centers.find(
                c => (c.name || '').trim().toLowerCase() === (matchedEvacuee.evacuation_location || '').trim().toLowerCase()
              );

              if (loadedCenter) {
                this.viewDetails(loadedCenter);
              } else {
                alert('Evacuee found but center was not found.');
              }
            },
            error: (err) => {
              console.error('Failed to reload centers:', err);
              alert('Evacuee found but failed to load center.');
            }
          });
        } else {
          this.highlightedSearch = '';
          alert('Evacuee not found.');
        }
      },
      error: (err) => {
        console.error('Search failed:', err);
        this.highlightedSearch = '';
        alert('Failed to search evacuee.');
      }
    });
  }

  isMatchedEvacuee(e: any): boolean {
    if (!this.highlightedSearch) return false;

    const first = (e.firstname || '').toLowerCase().trim();
    const last = (e.lastname || '').toLowerCase().trim();
    const middle = (e.middlename || '').toLowerCase().trim();

    const fullName = `${first} ${last}`.trim();
    const reverseFullName = `${last} ${first}`.trim();
    const fullWithMiddle = `${first} ${middle} ${last}`.replace(/\s+/g, ' ').trim();

    return (
      first.includes(this.highlightedSearch) ||
      last.includes(this.highlightedSearch) ||
      middle.includes(this.highlightedSearch) ||
      fullName.includes(this.highlightedSearch) ||
      reverseFullName.includes(this.highlightedSearch) ||
      fullWithMiddle.includes(this.highlightedSearch)
    );
  }

  resolveReport(report: any): void {
    if ((report.status || '').toLowerCase() === 'resolved') {
      return;
    }

    this.http.put(
      `${this.apiBaseUrl}/reports/${report.id}`,
      { status: 'Resolved' }
    ).subscribe({
      next: () => {
        report.status = 'Resolved';
        this.fetchReports();
      },
      error: (err) => {
        console.error('Failed to resolve report:', err);
        alert('Failed to resolve report.');
      }
    });
  }

  getStatusClass(status: string): string {
    const value = (status || '').toLowerCase().trim();

    if (value === 'normal') return 'normal';
    if (value === 'near full') return 'near-full';
    if (value === 'full') return 'full';

    return 'warning';
  }

  getReportStatusClass(status: string): string {
    const value = (status || '').toLowerCase().trim();

    if (value === 'resolved') return 'resolved';
    return 'ongoing';
  }

  getEvacueeCategory(evacuee: any): string {
    const raw = (
      evacuee?.category ||
      evacuee?.role ||
      evacuee?.user_type ||
      ''
    ).toString().trim().toLowerCase();

    if (raw === 'admin') return 'Admin';
    if (raw === 'official') return 'Official';

    return 'Resident';
  }

  getCategoryPriority(evacuee: any): number {
    const category = this.getEvacueeCategory(evacuee).toLowerCase();

    if (category === 'admin') return 1;
    if (category === 'official') return 2;
    return 3;
  }

  sortEvacuees(evacuees: any[]): any[] {
    return [...evacuees].sort((a, b) => {
      const priorityA = this.getCategoryPriority(a);
      const priorityB = this.getCategoryPriority(b);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      const lastA = (a.lastname || '').toLowerCase();
      const lastB = (b.lastname || '').toLowerCase();

      if (lastA !== lastB) {
        return lastA.localeCompare(lastB);
      }

      const firstA = (a.firstname || '').toLowerCase();
      const firstB = (b.firstname || '').toLowerCase();

      return firstA.localeCompare(firstB);
    });
  }

  private isPositiveYes(value: any): boolean {
    const normalized = String(value ?? '').trim().toLowerCase();
    return (
      normalized === 'yes' ||
      normalized === 'true' ||
      normalized === '1' ||
      normalized === 'pregnant' ||
      normalized === 'pwd'
    );
  }

  formatYesBlank(value: any): string {
    return this.isPositiveYes(value) ? 'Yes' : '';
  }

  private getAdminPrintStyles(): string {
    return `
      @page {
        size: A4;
        margin: 18mm;
      }

      @media print {
        html, body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          color-adjust: exact;
        }

        .watermark {
          position: fixed;
          inset: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 0;
          pointer-events: none;
        }

        .content {
          position: relative;
          z-index: 1;
        }

        thead {
          display: table-header-group;
        }

        tfoot {
          display: table-footer-group;
        }

        tr, td, th {
          page-break-inside: avoid;
        }
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
      }

      body {
        font-family: Arial, sans-serif;
        color: #111;
      }

      .page {
        position: relative;
        padding: 0;
      }

      .watermark img {
        width: 300px;
        max-width: 55%;
        opacity: 0.10;
        display: block;
      }

      .content {
        position: relative;
        z-index: 1;
      }

      .header {
        text-align: center;
        margin-bottom: 18px;
      }

      .header h1 {
        margin: 0;
        font-size: 22px;
        letter-spacing: 1px;
        font-weight: 800;
      }

      .header h2 {
        margin: 4px 0 0;
        font-size: 16px;
        font-weight: 700;
      }

      .meta {
        margin-bottom: 14px;
        font-size: 14px;
      }

      .meta div {
        margin-bottom: 4px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        background: transparent;
      }

      th, td {
        border: 1px solid #222;
        padding: 8px;
        font-size: 12px;
        text-align: left;
        vertical-align: top;
      }

      th {
        background: #f1f5f9;
        font-weight: 700;
      }
    `;
  }

  private openAdminPrintWindow(title: string, bodyHtml: string, logoUrl: string, popupFeatures: string): void {
    const printWindow = window.open('', '_blank', popupFeatures);
    if (!printWindow) return;

    const styles = this.getAdminPrintStyles();

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <meta charset="utf-8" />
          <style>
            ${styles}
          </style>
        </head>
        <body>
          <div class="watermark">
            <img id="watermarkImg" src="${logoUrl}" alt="Watermark Logo" />
          </div>

          <div class="page">
            <div class="content">
              ${bodyHtml}
            </div>
          </div>

          <script>
            (function () {
              var alreadyPrinted = false;

              function doPrint() {
                if (alreadyPrinted) return;
                alreadyPrinted = true;

                setTimeout(function () {
                  window.focus();
                  window.print();
                }, 400);
              }

              var img = document.getElementById('watermarkImg');

              if (!img) {
                doPrint();
                return;
              }

              if (img.complete) {
                doPrint();
              } else {
                img.onload = doPrint;
                img.onerror = doPrint;
                setTimeout(doPrint, 1500);
              }
            })();
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  }

  printCenterEvacuees(): void {
    if (!this.selectedCenter) return;

    const logoUrl = window.location.origin + '/assets/logo.png';

    const rows = this.centerEvacuees.map((e: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td>${e.lastname || '-'}</td>
        <td>${e.firstname || '-'}</td>
        <td>${e.middlename || '-'}</td>
        <td>${e.age || '-'}</td>
        <td>${e.gender || '-'}</td>
        <td>${e.phone_number || '-'}</td>
        <td>${this.formatYesBlank(e.pregnant)}</td>
        <td>${this.formatYesBlank(e.pwd)}</td>
      </tr>
    `).join('');

    const bodyHtml = `
      <div class="header">
        <h1>TUGUEGARAO CITY</h1>
        <h2>DISASTER OFFICE</h2>
      </div>

      <div class="meta">
        <div><strong>Evacuation Center:</strong> ${this.selectedCenter.name || '-'}</div>
        <div><strong>Date Printed:</strong> ${new Date().toLocaleString()}</div>
        <div><strong>Total Records:</strong> ${this.centerEvacuees.length}</div>
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Last Name</th>
            <th>First Name</th>
            <th>Middle Name</th>
            <th>Age</th>
            <th>Gender</th>
            <th>Phone Number</th>
            <th>Pregnant</th>
            <th>PWD</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="9">No evacuees found.</td></tr>`}
        </tbody>
      </table>
    `;

    this.openAdminPrintWindow(
      'Evacuees Report',
      bodyHtml,
      logoUrl,
      'width=1100,height=700'
    );
  }

  openTerms(): void {
    this.showTerms = true;
  }

  closeTerms(): void {
    this.showTerms = false;
  }

  openContact(): void {
    this.showContact = true;
  }

  closeContact(): void {
    this.showContact = false;
  }

  logout(): void {
    this.showLogoutConfirm = true;
  }

  confirmLogout(): void {
    localStorage.removeItem('user');
    this.router.navigate(['/login']);
  }

  cancelLogout(): void {
    this.showLogoutConfirm = false;
  }
}