import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpParams } from '@angular/common/http';

@Component({
  selector: 'app-official',
  templateUrl: './official.component.html',
  styleUrls: ['./official.component.css']
})
export class OfficialComponent implements OnInit, OnDestroy {
  assignedCenter: string = '';

  totalEvacuees: number = 0;
  totalFamilies: number = 0;
  active: number = 0;
  returned: number = 0;

  centerCapacity: number = 200;
  occupancyRate: number = 0;
  availableSlots: number = 0;

  maleCount: number = 0;
  femaleCount: number = 0;
  pwdCount: number = 0;
  pregnantCount: number = 0;

  centerStatusLabel: string = 'Normal';

  currentTimeLabel: string = '';
  currentDateLabel: string = '';
  currentDayLabel: string = '';
  selectedCalendarDate: string = new Date().toISOString().split('T')[0];

  private clockInterval: any;
  private searchTimeout: any = null;

  loggedUser: any;

  showEvacueesList: boolean = false;
  showEvacuationCenterDetails: boolean = false;
  showReports: boolean = false;

  showTerms: boolean = false;
  showContact: boolean = false;
  showLogoutConfirm: boolean = false;

  filteredCenter: any = null;
  evacuees: any[] = [];

  searchQuery: string = '';
  highlightedEvacueeId: number | null = null;

  searchSuggestions: any[] = [];
  showSuggestions: boolean = false;

  reportForm = {
    reportType: '',
    personName: '',
    details: '',
    status: 'Open'
  };

  submittedReports: any[] = [];

  constructor(
    private router: Router,
    private http: HttpClient
  ) { }

  ngOnInit(): void {
    this.loggedUser = JSON.parse(localStorage.getItem('user') || '{}');

    if (!this.loggedUser || this.loggedUser.role !== 'official') {
      alert('Access denied!');
      this.router.navigate(['/login']);
      return;
    }

    this.assignedCenter =
      this.loggedUser.barangay || this.loggedUser.evacuation_location || '';

    this.startClock();
    this.loadEvacueesFromDb();
    this.loadReports();
  }

  ngOnDestroy(): void {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
    }

    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }
  }

  startClock(): void {
    this.updateClock();

    this.clockInterval = setInterval(() => {
      this.updateClock();
    }, 1000);
  }

  updateClock(): void {
    const now = new Date();

    this.currentTimeLabel = now.toLocaleTimeString('en-PH', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

    this.currentDateLabel = now.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    this.currentDayLabel = now.toLocaleDateString('en-PH', {
      weekday: 'long'
    });
  }

  selectToday(): void {
    this.selectedCalendarDate = new Date().toISOString().split('T')[0];
  }

  private normalizeAge(value: any): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const age = Number(value);

    if (!Number.isInteger(age) || age < 0) {
      return null;
    }

    return age;
  }

  private normalizePhoneNumber(value: any): string {
    const phone = String(value || '').replace(/\s+/g, '').trim();
    return /^\+63\d{10}$/.test(phone) ? phone : '-';
  }

  private mapEvacuee(e: any): any {
    return {
      id: e.id,
      lastName: e.lastname,
      firstName: e.firstname,
      middleName: e.middlename,
      age: this.normalizeAge(e.age),
      gender: e.gender || '-',
      phoneNumber: this.normalizePhoneNumber(e.phone_number),
      arrival: e.created_at || '-',
      status: e.status || 'Active',
      returnedAt: e.returned_at || null,
      center: e.evacuation_location,
      pwd: e.pwd ?? e.isPwd ?? e.hasDisability ?? e.disability ?? '',
      pregnant: e.pregnant ?? e.isPregnant ?? e.buntis ?? ''
    };
  }

  private isPositiveYes(value: any): boolean {
    const normalized = String(value ?? '').trim().toLowerCase();
    return (
      normalized === 'yes' ||
      normalized === 'true' ||
      normalized === 'pwd' ||
      normalized === 'pregnant' ||
      normalized === '1'
    );
  }

  formatYesBlank(value: any): string {
    return this.isPositiveYes(value) ? 'Yes' : '';
  }

  loadEvacueesFromDb(): void {
    const params = new HttpParams().set('location', this.assignedCenter);

    this.http.get<any[]>('http://localhost:3000/api/evacuees', { params })
      .subscribe({
        next: (data) => {
          this.evacuees = (data || []).map(e => this.mapEvacuee(e));
          this.highlightedEvacueeId = null;
          this.computeStats();
        },
        error: (err) => {
          console.error('Failed to load evacuees:', err);
          alert('Failed to load evacuees from server');
        }
      });
  }

  loadEvacuees(): void {
    this.searchQuery = '';
    this.searchSuggestions = [];
    this.showSuggestions = false;
    this.loadEvacueesFromDb();
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
      this.highlightedEvacueeId = null;
      return;
    }

    if (!this.loggedUser?.username) {
      this.searchSuggestions = [];
      this.showSuggestions = false;
      return;
    }

    this.searchTimeout = setTimeout(() => {
      const params = new HttpParams()
        .set('username', this.loggedUser.username)
        .set('q', query);

      this.http.get<any[]>('http://localhost:3000/api/official/search-evacuee', { params })
        .subscribe({
          next: (results) => {
            this.searchSuggestions = (results || []).map(e => this.mapEvacuee(e));
            this.showSuggestions = true;
          },
          error: (err) => {
            console.error('Official suggestion search failed:', err);
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
      evacuee.firstName || '',
      evacuee.middleName || '',
      evacuee.lastName || ''
    ]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    this.searchQuery = fullName;
    this.showSuggestions = false;
    this.searchSuggestions = [];

    this.showEvacueesList = true;
    this.showEvacuationCenterDetails = false;
    this.showReports = false;

    this.searchEvacuee();
  }

  searchEvacuee(): void {
    const query = this.searchQuery.trim();

    if (!query) {
      alert('Please enter a name to search.');
      return;
    }

    if (!this.loggedUser?.username) {
      alert('User session not found.');
      return;
    }

    this.showEvacueesList = true;
    this.showEvacuationCenterDetails = false;
    this.showReports = false;
    this.showSuggestions = false;

    const params = new HttpParams()
      .set('username', this.loggedUser.username)
      .set('q', query);

    this.http.get<any[]>('http://localhost:3000/api/official/search-evacuee', { params })
      .subscribe({
        next: (results) => {
          this.evacuees = (results || []).map(e => this.mapEvacuee(e));
          this.highlightedEvacueeId = this.evacuees.length > 0 ? this.evacuees[0].id : null;
          this.computeStats();

          if (!this.evacuees.length) {
            alert('Evacuee not found in your assigned center.');
          }
        },
        error: (err) => {
          console.error('Official search failed:', err);
          alert('Failed to search evacuee.');
        }
      });
  }

  isMatchedEvacuee(evacuee: any): boolean {
    return this.highlightedEvacueeId === evacuee.id;
  }

  computeStats(): void {
    this.totalEvacuees = this.evacuees.length;
    this.active = this.evacuees.filter(e => e.status === 'Active').length;
    this.returned = this.evacuees.filter(e => e.status === 'Returned').length;
    this.totalFamilies = Math.ceil(this.active / 3);

    this.occupancyRate = this.centerCapacity > 0
      ? Math.round((this.active / this.centerCapacity) * 100)
      : 0;

    this.availableSlots = Math.max(this.centerCapacity - this.active, 0);

    this.maleCount = this.evacuees.filter(
      e => (e.gender || '').toLowerCase() === 'male'
    ).length;

    this.femaleCount = this.evacuees.filter(
      e => (e.gender || '').toLowerCase() === 'female'
    ).length;

    this.pwdCount = this.evacuees.filter(e => this.isPositiveYes(e.pwd)).length;
    this.pregnantCount = this.evacuees.filter(e => this.isPositiveYes(e.pregnant)).length;

    this.centerStatusLabel =
      this.occupancyRate >= 90 ? 'Critical Capacity' :
        this.occupancyRate >= 70 ? 'High Occupancy' :
          this.occupancyRate >= 40 ? 'Moderate Occupancy' :
            'Normal';
  }

  getCenterStatusClass(): string {
    if (this.occupancyRate >= 90) return 'critical';
    if (this.occupancyRate >= 70) return 'high';
    if (this.occupancyRate >= 40) return 'moderate';
    return 'normal';
  }

  getPieChartBackground(): string {
    const occupiedPercent = Math.max(0, Math.min(this.occupancyRate, 100));

    return `conic-gradient(
      #4ea3df 0% ${occupiedPercent}%,
      #e5e7eb ${occupiedPercent}% 100%
    )`;
  }

  formatArrival(value: string): string {
    if (!value || value === '-') return '-';

    const date = new Date(value);

    if (isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  markReturned(evacuee: any): void {
    if (!confirm(`Mark ${evacuee.firstName} ${evacuee.lastName} as returned?`)) {
      return;
    }

    const payload = {
      username: this.loggedUser.username
    };

    this.http.put(
      `http://localhost:3000/api/official/evacuees/${evacuee.id}/return`,
      payload
    ).subscribe({
      next: () => {
        evacuee.status = 'Returned';
        this.computeStats();
        alert('Evacuee marked as returned.');
      },
      error: (err) => {
        console.error('Failed to mark evacuee as returned:', err);
        alert(err?.error?.message || 'Failed to mark evacuee as returned.');
      }
    });
  }

  openEvacueesList(): void {
    this.showEvacueesList = true;
    this.showEvacuationCenterDetails = false;
    this.showReports = false;
    this.loadEvacuees();
  }

  openReports(): void {
    this.showReports = true;
    this.showEvacueesList = false;
    this.showEvacuationCenterDetails = false;
    this.loadReports();
  }

  goDashboard(): void {
    this.showEvacueesList = false;
    this.showEvacuationCenterDetails = false;
    this.showReports = false;
    this.computeStats();
  }

  submitReport(): void {
    if (!this.reportForm.reportType || !this.reportForm.details.trim()) {
      alert('Please complete the report type and details.');
      return;
    }

    const payload = {
      username: this.loggedUser.username,
      evacuation_location: this.assignedCenter,
      report_type: this.reportForm.reportType,
      person_name: this.reportForm.personName,
      details: this.reportForm.details,
      status: this.reportForm.status
    };

    this.http.post<any>('http://localhost:3000/api/official/reports', payload)
      .subscribe({
        next: () => {
          alert('Report submitted successfully.');

          this.reportForm = {
            reportType: '',
            personName: '',
            details: '',
            status: 'Open'
          };

          this.loadReports();
        },
        error: (err) => {
          console.error('Failed to submit report:', err);
          alert('Failed to submit report.');
        }
      });
  }

  loadReports(): void {
    if (!this.loggedUser?.username) return;

    const params = new HttpParams().set('username', this.loggedUser.username);

    this.http.get<any[]>('http://localhost:3000/api/official/reports', { params })
      .subscribe({
        next: (data) => {
          this.submittedReports = data || [];
        },
        error: (err) => {
          console.error('Failed to load reports:', err);
        }
      });
  }

  getReportBadgeClass(status: string): string {
    const normalized = String(status || '').trim().toLowerCase();

    if (normalized === 'open') return 'open';
    if (normalized === 'resolved') return 'resolved';
    return 'default';
  }

  private getPrintStyles(): string {
    return `
      @page {
        size: auto;
        margin: 14mm;
      }

      @media print {
        html, body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          color-adjust: exact;
        }

        body {
          font-family: Arial, sans-serif;
          color: #111827;
          margin: 0;
          padding: 0;
          background: #fff;
        }

        .page {
          position: relative;
          z-index: 1;
          padding: 0;
        }

        .content {
          position: relative;
          z-index: 2;
        }

        .watermark {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.08;
          z-index: 0;
          pointer-events: none;
        }

        .watermark img {
          width: 420px;
          max-width: 70vw;
        }

        h1, h2 {
          text-align: center;
          margin: 0;
        }

        h1 {
          font-size: 22px;
        }

        h2 {
          font-size: 16px;
          margin-bottom: 18px;
        }

        p {
          margin: 6px 0;
          font-size: 14px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 14px;
        }

        td, th {
          border: 1px solid #222;
          padding: 8px 10px;
          text-align: left;
          font-size: 13px;
          vertical-align: top;
        }

        th {
          background: #e5e7eb;
          font-weight: 700;
        }

        .summary-box {
          border: 1px solid #ccc;
          border-radius: 8px;
          padding: 18px;
          margin-top: 16px;
          background: rgba(255, 255, 255, 0.94);
        }

        .row {
          margin-bottom: 10px;
          font-size: 15px;
        }
      }
    `;
  }

  private openPrintWindow(
    title: string,
    bodyHtml: string,
    logoUrl: string,
    popupFeatures: string
  ): void {
    const printWindow = window.open('', '_blank', popupFeatures);
    if (!printWindow) return;

    const styles = this.getPrintStyles();

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

  printEvacueesList(): void {
    const logoUrl = window.location.origin + '/assets/Logo.png';

    const rows = (this.evacuees || []).map((evacuee: any, index: number) => `
      <tr>
        <td>${index + 1}</td>
        <td>${evacuee.lastName || '-'}</td>
        <td>${evacuee.firstName || '-'}</td>
        <td>${evacuee.middleName || '-'}</td>
        <td>${evacuee.age !== null && evacuee.age !== undefined ? evacuee.age : '-'}</td>
        <td>${evacuee.gender || '-'}</td>
        <td>${evacuee.phoneNumber || '-'}</td>
        <td>${this.formatArrival(evacuee.arrival)}</td>
        <td>${this.formatYesBlank(evacuee.pwd)}</td>
        <td>${this.formatYesBlank(evacuee.pregnant)}</td>
        <td>${evacuee.status || '-'}</td>
      </tr>
    `).join('');

    const bodyHtml = `
      <h1>TUGUEGARAO CITY</h1>
      <h2>DISASTER OFFICE</h2>

      <p><strong>Center:</strong> ${this.assignedCenter || '-'}</p>
      <p><strong>Total Evacuees:</strong> ${this.totalEvacuees ?? 0}</p>
      <p><strong>Date Printed:</strong> ${new Date().toLocaleString()}</p>

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
            <th>Arrival Date</th>
            <th>PWD</th>
            <th>Pregnant</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="11">No evacuees found.</td></tr>`}
        </tbody>
      </table>
    `;

    this.openPrintWindow(
      'Evacuees List',
      bodyHtml,
      logoUrl,
      'width=1100,height=700'
    );
  }

  exportEvacueesCSV(): void {
    const headers = [
      'No',
      'Last Name',
      'First Name',
      'Middle Name',
      'Age',
      'Gender',
      'Phone Number',
      'Arrival Date',
      'PWD',
      'Pregnant',
      'Status'
    ];

    const rows = (this.evacuees || []).map((evacuee: any, index: number) => [
      index + 1,
      evacuee.lastName || '',
      evacuee.firstName || '',
      evacuee.middleName || '',
      evacuee.age ?? '',
      evacuee.gender || '',
      evacuee.phoneNumber || '',
      this.formatArrival(evacuee.arrival),
      this.formatYesBlank(evacuee.pwd),
      this.formatYesBlank(evacuee.pregnant),
      evacuee.status || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row =>
        row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'evacuees-list.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  printReports(): void {
    const logoUrl = window.location.origin + '/assets/logo.png';

    const rows = (this.submittedReports || []).map((report: any, index: number) => `
      <tr>
        <td>${index + 1}</td>
        <td>${report.report_type || '-'}</td>
        <td>${report.person_name || '-'}</td>
        <td>${report.evacuation_location || '-'}</td>
        <td>${report.status || '-'}</td>
        <td>${this.formatArrival(report.created_at)}</td>
        <td>${report.details || '-'}</td>
      </tr>
    `).join('');

    const bodyHtml = `
      <h1>TUGUEGARAO CITY</h1>
      <h2>DISASTER OFFICE</h2>

      <p><strong>Center:</strong> ${this.assignedCenter || '-'}</p>
      <p><strong>Date Printed:</strong> ${new Date().toLocaleString()}</p>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Type</th>
            <th>Person</th>
            <th>Center</th>
            <th>Status</th>
            <th>Date</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="7">No reports found.</td></tr>`}
        </tbody>
      </table>
    `;

    this.openPrintWindow(
      'Submitted Reports',
      bodyHtml,
      logoUrl,
      'width=1100,height=750'
    );
  }

  exportReportsCSV(): void {
    const headers = [
      'No',
      'Report Type',
      'Person Name',
      'Evacuation Location',
      'Status',
      'Created At',
      'Details'
    ];

    const rows = (this.submittedReports || []).map((report: any, index: number) => [
      index + 1,
      report.report_type || '',
      report.person_name || '',
      report.evacuation_location || '',
      report.status || '',
      report.created_at || '',
      report.details || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row =>
        row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'submitted-reports.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
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
  goAddEvacuee(): void {
    this.router.navigate(['/dashboard']);
  }
}