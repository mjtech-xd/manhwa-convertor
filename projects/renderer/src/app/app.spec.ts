import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('creates the shell', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the brand', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.brand-name')?.textContent).toContain('Manhwa Convertor');
  });

  it('renders all nav tabs', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const tabs = (fixture.nativeElement as HTMLElement).querySelectorAll('.tab');
    expect(tabs.length).toBe(5);
  });
});
