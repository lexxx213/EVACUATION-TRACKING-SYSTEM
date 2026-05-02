import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

type LoginResponse = {
  username: string;
  role: 'admin' | 'official' | 'user';
  barangay?: string;
};

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',   // 🔥 IMPORTANT
  styleUrls: ['./login.component.css']    // ✅ FIXED
})
export class LoginComponent {

  username: string = '';
  password: string = '';
  showPassword: boolean = false;
  showTerms: boolean = false;
  error: string = '';
  acceptedTerms: boolean = false;
  loginSuccess: boolean = false;

  constructor(private router: Router, private http: HttpClient) {}

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  openTerms(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.showTerms = true;
  }

  closeTerms(): void {
    this.showTerms = false;
  }

  acceptTermsFromModal(): void {
    this.acceptedTerms = true;
    this.showTerms = false;
  }

  login(): void {
    if (!this.username || !this.password) {
      this.error = 'Please enter your username and password.';
      return;
    }

    if (!this.acceptedTerms) {
      this.error = 'You must accept the Terms of Use before logging in.';
      return;
    }

    this.error = '';

    this.http.post<LoginResponse>('http://localhost:3000/api/login', {
      username: this.username,
      password: this.password
    }).subscribe({
      next: (user) => {
        localStorage.setItem('user', JSON.stringify(user));

        this.loginSuccess = true;

        setTimeout(() => {
          if (user.role === 'admin') {
            this.router.navigate(['/admin']);
          } else if (user.role === 'official') {
            this.router.navigate(['/official']);
          } else {
            this.router.navigate(['/dashboard']);
          }
        }, 1500);
      },
      error: (err) => {
        this.loginSuccess = false;
        this.error = err?.error?.message || 'Invalid username or password';
      }
    });
  }
}