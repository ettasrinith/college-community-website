#include <iostream>
#include <vector>
#include <stack>
#include <algorithm>
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<int> height(n);
    for (int i = 0; i < n; ++i) {
        cin >> height[i];
    }

    // Precompute next higher or equal (odd jump)
    vector<int> next_higher(n, -1);
    stack<int> s;
    for (int i = n - 1; i >= 0; --i) {
        while (!s.empty() && height[s.top()] < height[i]) {
            s.pop();
        }
        if (!s.empty()) {
            next_higher[i] = s.top();
        }
        s.push(i);
    }
for( int a: next_higher){
    cout << a << " ";

}
    // Precompute next lower or equal (even jump)
    vector<int> next_lower(n, -1);
    s = stack<int>();
    for (int i = n - 1; i >= 0; --i) {
        while (!s.empty() && height[s.top()] > height[i]) {
            s.pop();
        }
        if (!s.empty()) {
            next_lower[i] = s.top();
        }
        s.push(i);
    }
    for( int a: next_lower){
        cout << a << " ";
    }
vector<bool> reach(n,false);
reach[n - 1] = true; // Last index is always reachable

    for (int i = n - 2; i >= 0; --i) {
       if(i%2==1){
if(next_higher[i] != -1 && reach[next_higher[i]]) {
            reach[i] = true;
        }
        
       }
        else{
            if(next_lower[i] != -1 && reach[next_lower[i]]) {
            reach[i] = true;
        }
        }
       
    }

    // Collect all good indices (starting with odd jump)
    vector<int> result;
    for (int i = 0; i < n; ++i) {
        if (reach[i]) {
            result.push_back(i);
        }
    }

    // Output in ascending order
    for (int idx : result) {
        cout << idx << endl;
    }

    return 0;
}