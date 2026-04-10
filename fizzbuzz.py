def fizz_buzz(n):
    result = []

    for i in range(1, n + 1):

        # Check if i is divisible by both 3 and 5
        if i % 3 == 0 and i % 5 == 0:

            # Add "FizzBuzz" to the result list
            result.append("FizzBuzz")
           # zxxxxx

        # Check if i is divisible by 3
        elif i % 3 == 0:

            # Add "Fizz" to the result list
            result.append("Fizz")

        # Check if i is divisible by 5
        elif i % 5 == 0:

            # Add "Buzz" to the result list
            result.append("Buzz")
        else:

            # Add the current number as a string to the result list
            result.append(str(i))
    return result

n = 10
result = fizz_buzz(n)
print(' '.join(result))

for i in range(5):
    print(i)
