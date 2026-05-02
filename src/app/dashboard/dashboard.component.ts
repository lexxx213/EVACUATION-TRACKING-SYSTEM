import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {

  private apiUrl = 'http://localhost:3000/api';

  centers: any[] = [];

  form = {
    lastname: '',
    firstname: '',
    middlename: '',
    age: '',
    gender: '',
    phone: '',
    evacuation_location: '',
    pwd: 'No',
    pregnant: 'No'
  };

  errorMessage = '';
  successMessage = '';
  loading = false;
  saving = false;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadCenters();
  }

  loadCenters() {
    this.loading = true;

    this.http.get<any[]>(`${this.apiUrl}/admin/centers`).subscribe({
      next: (data) => {
        this.centers = data;
        this.loading = false;
      },
      error: () => {
        this.errorMessage = 'Failed to load evacuation centers.';
        this.loading = false;
      }
    });
  }

  saveEvacuee() {
    this.errorMessage = '';
    this.successMessage = '';

    if (!this.form.lastname || !this.form.firstname || !this.form.gender || !this.form.evacuation_location) {
      this.errorMessage = 'Please fill required fields';
      return;
    }

    const payload = {
      ...this.form,
      phone: this.form.phone ? '+63' + this.form.phone : '',
      status: 'Active'
    };

    this.saving = true;

    this.http.post(`${this.apiUrl}/evacuees`, payload).subscribe({
      next: () => {
        this.successMessage = 'Evacuee saved!';
        this.saving = false;
        this.resetForm();
      },
      error: () => {
        this.errorMessage = 'Failed to save evacuee';
        this.saving = false;
      }
    });
  }

  resetForm() {
    this.form = {
      lastname: '',
      firstname: '',
      middlename: '',
      age: '',
      gender: '',
      phone: '',
      evacuation_location: '',
      pwd: 'No',
      pregnant: 'No'
    };
  }
}